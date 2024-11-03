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

  if (!token) {
    console.log("Error: Missing authentication token.");
    process.exit(1);
  }

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
  minTime: 61000,
});

async function fetchReposWithLimiter(username) {
  let octokit = getOctokitInstance();
  await limiter.schedule(() => searchTopReposForEnvFile(octokit, username));
}

async function searchTopReposForEnvFile(octokit, username) {
  try {
    const repos = await octokit.search.repos({
      q: `user:${username}`,
      sort: "stars",
      order: "desc",
      per_page: 7,
    });

    if (repos.data.items.length === 0) {
      console.log(`User ${username} doesn't have any repository.`);
      return;
    }

    for (const repo of repos.data.items) {
      const repoFullName = repo.full_name;
      console.log(`Checking repository: ${repoFullName}`);

      const codeSearch = await octokit.search.code({
        q: `filename:.env repo:${repoFullName}`,
      });

      if (codeSearch.data.items.length > 0) {
        console.log(`.env file found in repository ${repoFullName}`);
        codeSearch.data.items.forEach((item) => {
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
  const outputFilePath = "repos_found.txt";
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
  const processedUsersFile = "processed_users.txt";
  fs.appendFileSync(processedUsersFile, `${user}\n`, "utf-8");
}

function isUserProcessed(user) {
  const processedUsersFile = "processed_users.txt";
  if (!fs.existsSync(processedUsersFile)) {
    return false;
  }

  const processedUsers = fs.readFileSync(processedUsersFile, "utf-8").split("\n");
  return processedUsers.includes(user);
}

async function getRandomUserWithLimiter() {
  let octokit = getOctokitInstance();
  const maxUsersPerExecution = 2;
  const totalPages = 100;
  let usersProcessed = 0;
  const checkedUsers = new Set(); 
  const checkedPages = new Set(); 

  for (let attempt = 0; attempt < 10; attempt++) {
    let randomPage;

    do {
      randomPage = Math.floor(Math.random() * totalPages) + 1;
    } while (checkedPages.has(randomPage));

    checkedPages.add(randomPage); 
    const users = await octokit.search.users({
      q: `followers:>1000`,
      per_page: 5,
      page: randomPage,
    });

    if (users.data.items.length === 0) continue;

    const randomUserIndex = Math.floor(Math.random() * users.data.items.length); 
    const user = users.data.items[randomUserIndex].login;

    if (!isUserProcessed(user) && !checkedUsers.has(user)) {
      console.log(`Checking user: ${user}`);
      await fetchReposWithLimiter(user);
      saveProcessedUser(user);
      checkedUsers.add(user);
      usersProcessed++;

      if (usersProcessed >= maxUsersPerExecution) return;

      await new Promise((resolve) => setTimeout(resolve, 2000));
    } else {
      console.log(`User ${user} has already been processed or checked previously. Skipping...`);
    }
  }
}

async function main() {
  await getRandomUserWithLimiter();
}

main().catch(console.error);
