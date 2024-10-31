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
  tokenIndex = (tokenIndex + 1) % tokens.length;
  const token = tokens[tokenIndex];

  if (!token) {
    console.log("Error: Missing authentication token.");
    process.exit(1);
  }
  
  console.log(`Using token: ${tokenIndex + 1}`);
  return token;
}

function getOctokitInstance() {
  return new Octokit({
    auth: getNextToken()  // Ajuste para definir o token em cada instância do Octokit
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
  minTime: 61000
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

      const codeSearch = await octokit.search.code({
        q: `filename:.env repo:${repoFullName}`,  // Atualizado para procurar pelo arquivo .env
      });

      if (codeSearch.data.items.length > 0) {
        console.log(`.env file found in repository ${repoFullName}`);
        codeSearch.data.items.forEach(item => {
          const filePath = item.path;
          console.log(`File found: ${filePath}`);
          saveRepoAndFileToFile(repoFullName, filePath);
        });
      } else {
        console.log(`No .env files found.`);
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
    '5001..10000'
  ];

  for (const range of followerRanges) {
    const totalPages = await getTotalPages(octokit, range);
    if (totalPages === 0) continue;

    for (let attempt = 0; attempt < 3; attempt++) {  // Limite reduzido para 3 tentativas por faixa
      const randomPage = Math.floor(Math.random() * totalPages) + 1;
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
