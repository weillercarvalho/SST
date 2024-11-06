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
  process.env.GITHUB_TOKEN5,
];
let tokenIndex = 0;

function getNextToken() {
  tokenIndex = (tokenIndex + 1) % tokens.length;
  const token = tokens[tokenIndex];
  console.log(`Using token: ${tokenIndex + 1}`);
  return token;
}

function getOctokitInstance() {
  return new Octokit({
    auth: getNextToken()
  });
}

const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 80000 
});

async function fetchReposWithLimiter(username, keyword) {
  const octokit = getOctokitInstance();
  await limiter.schedule(() => searchTopReposByStars(octokit, username, keyword));
}

async function searchTopReposByStars(octokit, username, keyword) {
  try {
    const repos = await octokit.search.repos({
      q: `user:${username}`,
      sort: 'stars',
      order: 'desc',
      per_page: 5
    });

    for (const repo of repos.data.items) {
      const repoFullName = repo.full_name;
      console.log(`Checking repository: ${repoFullName}`);

      const codeSearch = await octokit.search.code({
        q: `${keyword} in:file repo:${repoFullName}`,
      });

      if (codeSearch.data.items.length > 0) {
        console.log(`Keyword "${keyword}" found in repository ${repoFullName}`);
        codeSearch.data.items.forEach(item => {
          const filePath = item.path;
          console.log(`Found in file: ${filePath}`);
          saveRepoAndFileToFile(repoFullName, filePath);
        });
      } else {
        console.log(`No occurrences in ${repoFullName}.`);
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
    if (err) console.error(`Error saving file in: ${err}`);
  });
}

function saveProcessedUser(user) {
  const processedUsersFile = 'processed_users.txt';
  fs.appendFileSync(processedUsersFile, `${user}\n`, 'utf-8');
}

function isUserProcessed(user) {
  const processedUsersFile = 'processed_users.txt';
  if (!fs.existsSync(processedUsersFile)) return false;

  const processedUsers = fs.readFileSync(processedUsersFile, 'utf-8').split('\n');
  return processedUsers.includes(user);
}

async function getRandomUserWithLimiter(keyword) {
  const octokit = getOctokitInstance();

  try {

    const initialSearch = await octokit.search.users({
      q: "followers:>1000",
      per_page: 1
    });
    const totalUsers = initialSearch.data.total_count;
    const totalPages = Math.ceil(totalUsers / 30); 


    const randomPage = Math.floor(Math.random() * totalPages) + 1;

    const users = await octokit.search.users({
      q: "followers:>1000",
      per_page: 1,
      page: randomPage
    });

    if (users.data.items.length === 0) return;

    const user = users.data.items[0].login;

    if (!isUserProcessed(user)) {
      console.log(`Checking user: ${user} from page: ${randomPage}`);
      await fetchReposWithLimiter(user, keyword);
      saveProcessedUser(user);
    } else {
      console.log(`User ${user} has already been processed previously. Skipping...`);
    }
  } catch (error) {
    console.error("Error fetching user:", error);
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
  await getRandomUserWithLimiter(keywordQuery);
}

main().catch(console.error);
