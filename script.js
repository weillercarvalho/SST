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
let currentToken = tokens[tokenIndex];

function getOctokitInstance() {
  return new Octokit({ auth: currentToken });
}

function switchToken() {
  tokenIndex = (tokenIndex + 1) % tokens.length;
  currentToken = tokens[tokenIndex];
  console.log(`Switched to token ${tokenIndex + 1}`);
  return getOctokitInstance();
}

async function checkAndHandleRateLimit(octokit, resource) {
  try {
    const rateLimit = await octokit.rateLimit.get();
    const remaining = rateLimit.data.resources[resource].remaining;
    const resetTime = rateLimit.data.resources[resource].reset * 1000;

    if (remaining === 0) {
      const waitTime = resetTime - Date.now();
      console.log(`Rate limit for ${resource} reached. Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return switchToken(); 
    }
    return octokit;
  } catch (error) {
    console.error(`Error checking rate limit for ${resource}:`, error);
    return switchToken();
  }
}

const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 65000
});

async function fetchReposWithLimiter(username, keyword) {
  let octokit = await checkAndHandleRateLimit(getOctokitInstance(), 'code_search');
  await limiter.schedule(() => searchTopReposByStars(octokit, username, keyword));
}

async function searchTopReposByStars(octokit, username, keyword) {
  try {
    const repos = await octokit.search.repos({
      q: `user:${username}`,
      sort: 'stars',
      order: 'desc',
      per_page: 7
    });

    if (repos.data.items.length === 0) {
      console.log(`User ${username} doesn't have any repositories.`);
      return;
    }

    for (const repo of repos.data.items) {
      const repoFullName = repo.full_name;
      console.log(`Checking repository: ${repoFullName}`);

      octokit = await checkAndHandleRateLimit(octokit, 'code_search'); 

      const codeSearch = await octokit.search.code({
        q: `${keyword} in:file repo:${repoFullName}`,
      });

      if (codeSearch.data.items.length > 0) {
        console.log(`Keyword "${keyword}" found in repository ${repoFullName}`);
        codeSearch.data.items.forEach(item => {
          const filePath = item.path;
          console.log(`Keyword found in file: ${filePath}`);
          saveRepoAndFileToFile(repoFullName, filePath);
        });
      } else {
        console.log(`No occurrences found.`);
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
      console.error(`Error saving file: ${err}`);
    } else {
      console.log(`Repository ${repoFullName} and file ${filePath} saved.`);
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
    octokit = await checkAndHandleRateLimit(octokit, 'search');
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

async function getRandomUserWithLimiter(keyword) {
  let octokit = getOctokitInstance();
  const followerRanges = [
    '1000..3000',
    '3001..5000',
    '5001..10000',
    '10001..20000',
    '20001..50000',
    '50001..100000'
  ];

  for (const range of followerRanges) {
    const totalPages = await getTotalPages(octokit, range);
    if (totalPages === 0) continue;

    for (let attempt = 0; attempt < 7; attempt++) { 
      const randomPage = Math.floor(Math.random() * totalPages) + 1;

      octokit = await checkAndHandleRateLimit(octokit, 'search'); 

      const users = await octokit.search.users({
        q: `followers:${range}`,
        per_page: 1,
        page: randomPage
      });

      if (users.data.items.length === 0) continue;

      const user = users.data.items[0].login;

      if (!isUserProcessed(user)) {
        console.log(`Checking user: ${user} in range ${range}`);
        await fetchReposWithLimiter(user, keyword);
        saveProcessedUser(user);
        return;
      } else {
        console.log(`User ${user} has already been processed previously. Skipping...`);
      }
    }
  }
}

async function main() {
  const keywords = [
    "API_KEY", "API_SECRET", "ACCESS_KEY", "ACCESS_TOKEN", "SECRET_KEY",
    "DB_PASSWORD", "DB_USER", "PRODUCTION_API_KEY",
    "PRIVATE_KEY", "SSL_CERT", "TLS_KEY", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN", "AZURE_CLIENT_ID", "AZURE_SECRET", "GCP_CREDENTIALS",
    "GCP_API_KEY", "ADMIN_PASSWORD", "EMAIL_PASSWORD", "MYSQL_PASSWORD", "PG_PASSWORD",
    "BEARER_TOKEN", "AUTH_TOKEN", "CREDENTIALS", "TOKEN", "PASSWORD_HASH", "ENCRYPTION_KEY", "CLIENT_SECRET", "SECRET_TOKEN", "APP_SECRET", "JWT_SECRET",
    "OAUTH_TOKEN", "SSH_KEY", "SSH_PRIVATE_KEY", "CLOUD_SECRET", "AUTH_KEY", "AUTH_SECRET", "POSTGRES_PASSWORD", "MONGO_PASSWORD", "ELASTIC_PASSWORD",
    "API_TOKEN", "API_PRIVATE_KEY", "GOOGLE_API_KEY", "GITHUB_TOKEN", "BITBUCKET_TOKEN", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "DOCKER_PASSWORD", "DOCKER_TOKEN"
  ];

  const keywordQuery = keywords.join(" OR ");
  
  // Executa o processo de busca e verificação apenas uma vez
  await getRandomUserWithLimiter(keywordQuery);
}

main().catch(console.error);
