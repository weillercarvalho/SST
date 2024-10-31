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


function getNextToken() {
  tokenIndex = (tokenIndex + 1) % tokens.length;
  const token = tokens[tokenIndex];
  console.log(`Usando o token: ${tokenIndex + 1}`);
  return token;
}


function getOctokitInstance() {
  return new Octokit({
    auth: getNextToken()
  });
}


async function checkAndHandleCodeSearchRateLimit(octokit) {
  const rateLimit = await octokit.rateLimit.get();
  const searchLimit = rateLimit.data.resources.search;
  const resetTime = searchLimit.reset * 1000;

  console.log(`Limite de buscas de código: ${searchLimit.limit}`);
  console.log(`Requisições de busca de código restantes: ${searchLimit.remaining}`);
  console.log(`Reseta em: ${new Date(resetTime)}`);

  if (searchLimit.remaining === 0) {
    const currentTime = Date.now();
    const waitTime = resetTime - currentTime;

    if (waitTime > 0) {
      console.log(`Limite de buscas de código atingido. Aguardando ${Math.ceil(waitTime / 1000)} segundos até o reset...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}


async function checkAndHandleRateLimit(octokit) {
  try {
    const rateLimit = await octokit.rateLimit.get();
    const remaining = rateLimit.data.resources.core.remaining;
    const resetTime = rateLimit.data.resources.core.reset * 1000;

    console.log(`Requisições restantes: ${remaining}`);
    if (remaining < 50) {
      const currentTime = Date.now();
      const waitTime = resetTime - currentTime;

      if (waitTime > 0) {
        console.log(`Quase atingindo o limite de taxa. Aguardando ${Math.ceil(waitTime / 1000)} segundos até o reset...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      octokit = getOctokitInstance();
    }
  } catch (error) {
    if (error.status === 403 || error.status === 401) {
      console.log('Erro de autenticação ou limite de requisições atingido. Alternando token...');
      octokit = getOctokitInstance();
      await checkAndHandleRateLimit(octokit);
    } else {
      console.error('Erro inesperado ao verificar o limite de requisições:', error);
    }
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


async function checkRateLimit(octokit) {
  const rateLimit = await octokit.rateLimit.get();
  const coreLimit = rateLimit.data.resources.core;
  const searchLimit = rateLimit.data.resources.search;

  console.log(`Limite de requisições: ${coreLimit.limit}`);
  console.log(`Requisições restantes: ${coreLimit.remaining}`);
  console.log(`Reseta em: ${new Date(coreLimit.reset * 1000)}`);

  console.log(`Limite de buscas de código: ${searchLimit.limit}`);
  console.log(`Requisições de busca de código restantes: ${searchLimit.remaining}`);
  console.log(`Reseta em: ${new Date(searchLimit.reset * 1000)}`);
}


const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 61000 
});


async function fetchReposWithLimiter(username, keyword) {
  let octokit = getOctokitInstance();
  await checkAndHandleRateLimit(octokit);
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
      console.log(`Usuário ${username} não possui repositórios.`);
      return;
    }

    for (const repo of repos.data.items) {
      const repoFullName = repo.full_name;
      console.log(`Verificando repositório: ${repoFullName}`);

      await checkAndHandleCodeSearchRateLimit(octokit);

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


async function getRandomUserWithLimiter(keyword) {
  try {
    const totalPages = 100; 
    let octokit = getOctokitInstance();

    for (let attempt = 0; attempt < 10; attempt++) {
      const randomPage = Math.floor(Math.random() * totalPages) + 1;
      const users = await octokit.search.users({
        q: 'followers:>3000',
        per_page: 1,
        page: randomPage,
        sort: 'followers',
        order: 'desc',
      });

      if (users.data.items.length === 0) continue;

      const user = users.data.items[0].login;

      if (!isUserProcessed(user)) {
        console.log(`Verificando usuário: ${user}`);
        await fetchReposWithLimiter(user, keyword);
        saveProcessedUser(user);
        getNextToken(); 
        return;
      } else {
        console.log(`Usuário ${user} já foi processado anteriormente. Pulando...`);
      }
    }
  } catch (error) {
    console.error("Erro ao buscar usuário:", error);
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

  for (let i = 0; i < 5; i++) { 
    await getRandomUserWithLimiter(keywordQuery);
  }

  const octokit = getOctokitInstance();
  await checkRateLimit(octokit);
}

main().catch(console.error);
