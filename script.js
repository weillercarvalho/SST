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
    auth: getNextToken(),
  });
}

const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 2000,
});

function saveProcessedUser(username) {
  const processedUsersFile = "processed_users.txt";
  try {
    fs.appendFileSync(processedUsersFile, `${username}\n`, "utf-8");
  } catch (err) {
    console.error(`Failed to save processed user ${username}:`, err);
  }
}

function saveToRepoFound(username, repoFullName, filePath) {
  const repoFoundFile = "repo_found.txt";
  const logMessage = `User: ${username}, Repository: ${repoFullName}, File: ${filePath}\n`;
  try {
    fs.appendFileSync(repoFoundFile, logMessage, "utf-8");
  } catch (err) {
    console.error(`Failed to save found repository for ${username}:`, err);
  }
}

function isUserProcessed(username) {
  const processedUsersFile = "processed_users.txt";
  if (!fs.existsSync(processedUsersFile)) return false;

  const processedUsers = fs
    .readFileSync(processedUsersFile, "utf-8")
    .split("\n");
  return processedUsers.includes(username);
}

async function processSingleUser(username, keywordQuery) {
  const octokit = getOctokitInstance();

  try {
    const repos = await octokit.search.repos({
      q: `user:${username}`,
      sort: "stars",
      order: "desc",
      per_page: 5,
    });

    let keywordFound = false;

    for (const repo of repos.data.items) {
      const repoFullName = repo.full_name;
      console.log(`Checking repository: ${repoFullName}`);

      const codeSearch = await octokit.search.code({
        q: `${keywordQuery} in:file repo:${repoFullName}`,
      });

      if (codeSearch.data.items.length > 0) {
        keywordFound = true;
        codeSearch.data.items.forEach((item) => {
          const filePath = item.path;
          console.log(
            `Keyword found in repository: ${repoFullName}, file: ${filePath}`
          );
          saveToRepoFound(username, repoFullName, filePath);
        });
      }
    }

    if (!keywordFound) {
      console.log(`No keywords found for user: ${username}`);
    }

    saveProcessedUser(username);
  } catch (error) {
    if (error.status === 422) {
      console.error(
        `Validation error for user ${username}. Skipping this user.`
      );
      saveProcessedUser(username);
    } else {
      console.error(`Error processing user ${username}:`, error);
    }
  }
}

async function processOneUser(keywordQuery) {
  const octokit = getOctokitInstance();
  let page = 1;

  while (true) {
    try {
      console.log(`Fetching page ${page}...`);
      const users = await octokit.search.users({
        q: "followers:>1000",
        per_page: 100,
        page: page,
      });

      if (users.data.items.length === 0) {
        console.log("No more users to process.");
        return;
      }

      for (const user of users.data.items) {
        const username = user.login;
        if (!isUserProcessed(username)) {
          console.log(`Processing user: ${username}`);
          await limiter.schedule(() => processSingleUser(username, keywordQuery));
          return; 
        } else {
          console.log(`User ${username} already processed. Skipping.`);
        }
      }

      page++; 
    } catch (error) {
      console.error(`Error fetching users on page ${page}:`, error);
      break;
    }
  }
}

async function main() {
const keywords = [
  "API_KEY",
  "API_SECRET",
  "ACCESS_KEY",
  "ACCESS_TOKEN",
  "SECRET_KEY",
  "DB_PASSWORD",
  "DB_USER",
  "DB_HOST",
  "DB_NAME",
  "DATABASE_URL",
  "JWT_SECRET",
  "PRIVATE_KEY",
  "PUBLIC_KEY",
  "SSH_KEY",
  "ENCRYPTION_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "GCP_CREDENTIALS",
  "AZURE_SUBSCRIPTION_ID",
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
  "SLACK_TOKEN",
  "DISCORD_TOKEN",
  "GITHUB_TOKEN",
  "GOOGLE_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET"
];

  const keywordQuery = keywords.join(" OR ");
  await processOneUser(keywordQuery);
}

main().catch(console.error);
