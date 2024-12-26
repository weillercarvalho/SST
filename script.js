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

function saveProcessedUser(username) {
  const processedUsersFile = "processed_users.txt";
  try {
    fs.appendFileSync(processedUsersFile, `${username}\n`, "utf-8");
  } catch (err) {
    console.error(`Failed to save processed user ${username}:`, err);
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
      per_page: 7,
    });

    for (const repo of repos.data.items) {
      const repoFullName = repo.full_name;
      console.log(`Checking repository: ${repoFullName}`);

      const codeSearch = await octokit.search.code({
        q: `${keywordQuery} in:file repo:${repoFullName}`,
      });

      if (codeSearch.data.items.length > 0) {
        codeSearch.data.items.forEach((item) => {
          console.log(
            `Keyword found in repository: ${repoFullName}, file: ${item.path}`
          );
        });
      }
    }

    saveProcessedUser(username);
    console.log(`Successfully processed user: ${username}`);
    return true;
  } catch (error) {
    console.error(`Error processing user ${username}:`, error);

    // Save the user that caused the error to processed_users.txt
    saveProcessedUser(username);
    console.log(`User ${username} caused an error and was marked as processed.`);
    return false;
  }
}

async function fetchAndProcessUsers(criteria, keywordQuery) {
  const octokit = getOctokitInstance();
  let page = 7;

  while (true) {
    try {
      console.log(`Fetching users with criteria: ${criteria}, page ${page}...`);
      const users = await octokit.search.users({
        q: criteria,
        per_page: 100,
        page,
      });

      if (users.data.items.length === 0) {
        console.log("No more users to process.");
        break;
      }

      for (const user of users.data.items) {
        const username = user.login;

        if (!isUserProcessed(username)) {
          console.log(`Processing user: ${username}`);
          const success = await processSingleUser(username, keywordQuery);

          if (success) {
            return; 
          }
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
    "GOOGLE_CLIENT_SECRET",
  ];

  const keywordQuery = keywords.join(" OR ");
  const criteria = "followers:>1000"; 

  await fetchAndProcessUsers(criteria, keywordQuery);
  console.log("Finished processing.");
}

main().catch(console.error);
