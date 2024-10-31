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
  if (tokenAttempts >= 5) {
    console.log("Limite de tentativas de troca de token atingido. Interrompendo o script.");
    process.exit(); 
  }
  tokenIndex = (tokenIndex + 1) % tokens.length;
  tokenAttempts += 1;
  const token = tokens[tokenIndex];
  console.log(`Usando o token: ${tokenIndex + 1}`);
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
      console.log(`Limite de ${resource} atingido. Aguardando ${Math.ceil(waitTime / 1000)} segundos para resetar...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Erro ao verificar o limite de taxa para ${resource}:`, error);
    return true;
  }
}

const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 61000
});

async function fetchReposWithLimiter(username, keyword) {
  let octokit = getOctokitInstance();
  const exceeded = await checkAndHandleRateLimit(octokit, 'search');
  if (!exceeded) {
    await limiter.schedule(() => searchTopReposByStars(octokit, username, keyword));
  }
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
      console.log(`Usuário ${username} não possui repositórios.`);
      return;
    }

    for (const repo of repos.data.items) {
      const repoFullName = repo.full_name;
      console.log(`Verificando repositório: ${repoFullName}`);

      const codeSearch = await octokit.search.code({
        q: `${keyword} in:file repo:${repoFullName}`,
      });

      if (codeSearch.data.items.length > 0) {
        console.log(`Palavra "${keyword}" encontrada no repositório ${repoFullName}`);
        codeSearch.data.items.forEach(item => {
          const filePath = item.path;
          console.log(`Palavra encontrada no arquivo: ${filePath}`);
          saveRepoAndFileToFile(repoFullName, filePath);
        });
      } else {
        console.log(`Nenhuma ocorrência.`);
      }
    }
  } catch (error) {
    console.error(`Erro ao buscar repositórios de ${username}:`, error);
  }
}

function saveRepoAndFileToFile(repoFullName, filePath) {
  const outputFilePath = 'repos_found.txt';
  const logMessage = `Repositório: ${repoFullName}, Arquivo: ${filePath}\n`;
  fs.appendFile(outputFilePath, logMessage, (err) => {
    if (err) {
      console.error(`Erro ao salvar no arquivo: ${err}`);
    } else {
      console.log(`Repositório ${repoFullName} e arquivo ${filePath} adicionados ao arquivo.`);
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
    console.error("Erro ao obter o número total de usuários:", error);
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
      const users = await octokit.search.users({
        q: `followers:${range}`,
        per_page: 1,
        page: randomPage
      });

      if (users.data.items.length === 0) continue;

      const user = users.data.items[0].login;

      if (!isUserProcessed(user)) {
        console.log(`Verificando usuário: ${user} no intervalo ${range}`);
        await fetchReposWithLimiter(user, keyword);
        saveProcessedUser(user);
        return;
      } else {
        console.log(`Usuário ${user} já foi processado anteriormente. Pulando...`);
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
  let attempt = 0;

  while (attempt < 3) { 
    await getRandomUserWithLimiter(keywordQuery);
    attempt++;
  }
}

main().catch(console.error);
