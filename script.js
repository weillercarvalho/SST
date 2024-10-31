import { Octokit } from "@octokit/rest";
import Bottleneck from "bottleneck";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

const tokens = [
  process.env.GITHUB_TOKEN1,
  process.env.GITHUB_TOKEN2,
  process.env.GITHUB_TOKEN3,
  process.env.GITHUB_TOKEN4,
  process.env.GITHUB_TOKEN5
];

let tokenIndex = 0;
let tokenAttempts = 0;

function getNextToken() {
  if (tokenAttempts >= 4) {
    console.log("Token exchange attempt limit reached. Interrupting the script.");
    process.exit();
  }
  tokenIndex = (tokenIndex + 1) % tokens.length;
  tokenAttempts += 1;
  const token = tokens[tokenIndex];
  console.log(`Using token: ${tokenIndex + 1}`);
  return token;
}

function getOctokitInstance() {
  return new Octokit({
    auth: getNextToken()
  });
}

async function checkAndHandleRateLimit(octokit, resource) {
  try {
    const rateLimit = await octokit.rateLimit.get();
    const remaining = rateLimit.data.resources[resource].remaining;
    const resetTime = rateLimit.data.resources[resource].reset * 1000;

    if (remaining === 0) {
      const currentTime = Date.now();
      const waitTime = resetTime - currentTime;
      console.log(`Limit ${resource} reached. Awaiting ${Math.ceil(waitTime / 1000)} seconds to reset...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error checking rate limit for ${resource}:`, error);
    return true;
  }
}

const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 300000 // 5 minutos entre chamadas para reduzir o risco de limitação de taxa no GitHub Actions
});

async function fetchReposWithLimiter(username) {
  let octokit = getOctokitInstance();
  const exceeded = await checkAndHandleRateLimit(octokit, 'search');
  if (!exceeded) {
    await limiter.schedule(() => searchTopReposForEnvFile(octokit, username));
  }
}

async function searchTopReposForEnvFile(octokit, username) {
  try {
    const repos = await octokit.search.repos({
      q: `user:${username}`,
      sort: 'stars',
      order: 'desc',
      per_page: 7
    });

    if (repos.data.items.length === 0) {
      console.log(`User ${username} doesn't have any repository.`);
      return;
    }

    for (const repo of repos.data.items) {
      const repoFullName = repo.full_name;
      console.log(`Checking repository: ${repoFullName}`);

      const fileSearch = await octokit.search.code({
        q: `filename:.env repo:${repoFullName}`,
      });

      if (fileSearch.data.items.length > 0) {
        console.log(`.env file found in repository ${repoFullName}`);
        fileSearch.data.items.forEach(item => {
          const filePath = item.path;
          console.log(`.env file found at: ${filePath}`);
          saveRepoAndFileToFile(repoFullName, filePath);
        });
      } else {
        console.log(`No .env file found.`);
      }
    }
  } catch (error) {
    console.error(`Error checking repository of ${username}:`, error);
  }
}

function saveRepoAndFileToFile(repoFullName, filePath) {
  const outputFilePath = 'repos_found.txt';
  const logMessage = `Repository: ${repoFullName}, File: ${filePath}\n`;
  fs.appendFile(outputFilePath, logMessage, (err) => {
    if (err) {
      console.error(`Error saving file in: ${err}`);
    } else {
      console.log(`Repository ${repoFullName} and file ${filePath} added to archive.`);
    }
  });
}

function saveProcessedUser(user) {
  const processedUsersFile = 'processed_users.txt';
  fs.appendFileSync(processedUsersFile, `${user}\n`, 'utf-8');
}

function isUserProcessed(user) {
  const processedUsersFile = 'processed_users.txt';
  if (!fs.existsSync(processedUsersFile)) {
    return false;
  }

  const processedUsers = fs.readFileSync(processedUsersFile, 'utf-8').split('\n');
  return processedUsers.includes(user);
}

async function getTotalPages(octokit, range) {
  try {
    const response = await octokit.search.users({
      q: `followers:${range}`,
      per_page: 1
    });

    const totalUsers = Math.min(response.data.total_count, 1000);
    return Math.ceil(totalUsers / 100);
  } catch (error) {
    console.error("Error getting total number of users:", error);
    return 0;
  }
}

async function getRandomUserWithLimiter() {
  let octokit = getOctokitInstance();
  const followerRanges = [
    '1000..3000',
    '3001..5000',
    '5001..10000',
    '10001..20000',
    '20001..50000',
    '50001..100000'
  ];

  // Limite de tentativas e páginas para reduzir o número de requisições
  const maxAttemptsPerRange = 2; // Reduzido para 2 tentativas por faixa de seguidores
  const maxPagesPerRange = 5;    // Limite para as primeiras 5 páginas por faixa

  for (const range of followerRanges) {
    const totalPages = await getTotalPages(octokit, range);

    // Use o menor valor entre as páginas totais e o máximo de páginas definido
    const pagesToSearch = Math.min(totalPages, maxPagesPerRange);
    if (pagesToSearch === 0) continue;

    // Tente buscar um número reduzido de usuários aleatórios dentro do limite de tentativas
    for (let attempt = 0; attempt < maxAttemptsPerRange; attempt++) {
      const randomPage = Math.floor(Math.random() * pagesToSearch) + 1;

      const limitExceeded = await checkAndHandleRateLimit(octokit, 'search'); // Verifica o limite antes de buscar usuários

      if (limitExceeded) octokit = getOctokitInstance();

      const users = await octokit.search.users({
        q: `followers:${range}`,
        per_page: 1,
        page: randomPage
      });

      if (users.data.items.length === 0) continue;

      const user = users.data.items[0].login;

      if (!isUserProcessed(user)) {
        console.log(`Checking user: ${user} in range ${range}`);
        await fetchReposWithLimiter(user);
        saveProcessedUser(user);
        return;
      } else {
        console.log(`User ${user} has already been processed previously. Skipping...`);
      }
    }
  }
}

async function main() {
  await getRandomUserWithLimiter();
}

main().catch(console.error);
