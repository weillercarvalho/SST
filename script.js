import { Octokit } from "@octokit/rest";
import Bottleneck from "bottleneck";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

// Carregar os tokens do arquivo .env
const tokens = [
  process.env.GITHUB_TOKEN1,
  process.env.GITHUB_TOKEN2,
  process.env.GITHUB_TOKEN3,
  process.env.GITHUB_TOKEN4,
  process.env.GITHUB_TOKEN5
];

let tokenIndex = 0;

// Função para alternar entre tokens
function getNextToken() {
  tokenIndex = (tokenIndex + 1) % tokens.length;
  const token = tokens[tokenIndex];
  console.log(`Usando o token: ${tokenIndex + 1}`);
  return token;
}

// Função para criar uma nova instância do Octokit com o token atual
function getOctokitInstance() {
  return new Octokit({
    auth: getNextToken()
  });
}

// Função para verificar o limite de buscas de código e aguardar até o reset se o limite for atingido
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

// Função para verificar o limite de requisições e aguardar até o reset se o limite for atingido
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
      // Troca o token após a pausa
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

// Função para salvar o nome do repositório e o arquivo onde a palavra-chave foi encontrada
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

// Função para salvar usuários já verificados
function saveProcessedUser(user) {
  const processedUsersFile = 'processed_users.txt';
  fs.appendFileSync(processedUsersFile, `${user}\n`, 'utf-8');
}

// Função para verificar se o usuário já foi processado
function isUserProcessed(user) {
  const processedUsersFile = 'processed_users.txt';
  if (!fs.existsSync(processedUsersFile)) {
    return false;
  }

  const processedUsers = fs.readFileSync(processedUsersFile, 'utf-8').split('\n');
  return processedUsers.includes(user);
}

// Função para verificar os limites após a execução
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

// Cria um limitador de taxa usando Bottleneck
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 61000 // 61 segundos entre cada requisição de busca de código
});

// Função para buscar repositórios de um usuário com o limitador
async function fetchReposWithLimiter(username, keyword) {
  let octokit = getOctokitInstance();
  await checkAndHandleRateLimit(octokit);
  await limiter.schedule(() => searchTopReposByStars(octokit, username, keyword));
}

// Função para buscar os 7 repositórios mais populares (ordenados por estrelas)
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

      // Construção da query para a busca de código, usando corretamente o operador OR
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

// Função para buscar perfis com mais de 5.000 seguidores, verificando se já foram processados
async function getRandomUsersAndSearchWithLimiter(keyword) {
  try {
    const totalPages = 100;
    const randomPage = Math.floor(Math.random() * totalPages) + 1;
    let octokit = getOctokitInstance();

    const users = await octokit.search.users({
      q: 'followers:>5000',
      per_page: 10,
      page: randomPage,
      sort: 'followers',
      order: 'desc',
    });

    await Promise.all(users.data.items.map(async (user) => {
      if (!isUserProcessed(user.login)) {
        console.log(`Verificando usuário: ${user.login}`);
        await fetchReposWithLimiter(user.login, keyword);
        saveProcessedUser(user.login);
        getNextToken();
      } else {
        console.log(`Usuário ${user.login} já foi processado anteriormente. Pulando...`);
      }
    }));
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
  }
}

// Função principal para rodar o script
async function main() {
  const keywords = [
    "API_KEY", "API_SECRET", "ACCESS_KEY", "PASSWORD", "ACCESS_TOKEN", "SECRET_KEY",
    "DB_PASSWORD", "DB_USER", "DATABASE_URL", "PROD_DB_PASSWORD", "PRODUCTION_API_KEY",
    "PRIVATE_KEY", "SSL_CERT", "TLS_KEY", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN", "AZURE_CLIENT_ID", "AZURE_SECRET", "GCP_CREDENTIALS",
    "GCP_API_KEY", "ADMIN_PASSWORD", "EMAIL_PASSWORD", "MYSQL_PASSWORD", "PG_PASSWORD",
    "BEARER_TOKEN", "AUTH_TOKEN"
  ];

  // Construindo a query com o operador OR entre cada palavra-chave
  const keywordQuery = keywords.join(" OR ");
  
  await getRandomUsersAndSearchWithLimiter(keywordQuery);

  const octokit = getOctokitInstance();
  await checkRateLimit(octokit);
}

main().catch(console.error);
