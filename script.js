import { Octokit } from "@octokit/rest";
import Bottleneck from "bottleneck";
import dotenv from "dotenv";
import fs from "fs";  // Importa o módulo fs para escrever em arquivos
dotenv.config();

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

// Função para verificar o limite de buscas de código e aguardar até o reset se o limite for atingido
async function checkAndHandleCodeSearchRateLimit() {
  const rateLimit = await octokit.rateLimit.get();
  const searchLimit = rateLimit.data.resources.search;  // Limite específico de busca de código
  const resetTime = searchLimit.reset * 1000;

  console.log(`Limite de buscas de código: ${searchLimit.limit}`);
  console.log(`Requisições de busca de código restantes: ${searchLimit.remaining}`);
  console.log(`Reseta em: ${new Date(resetTime)}`);

  if (searchLimit.remaining === 0) {
    const currentTime = Date.now();
    const waitTime = resetTime - currentTime;

    console.log(`Limite de buscas de código atingido. Aguardando ${Math.ceil(waitTime / 1000)} segundos até o reset...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));  // Aguarda até o reset
  }
}

// Função para verificar o limite de requisições e aguardar até o reset se o limite for atingido
async function checkAndHandleRateLimit() {
  const rateLimit = await octokit.rateLimit.get();
  const remaining = rateLimit.data.resources.core.remaining;
  const resetTime = rateLimit.data.resources.core.reset * 1000;

  console.log(`Requisições restantes: ${remaining}`);
  if (remaining < 50) {  // Pausar quando restam menos de 50 requisições
    const currentTime = Date.now();
    const waitTime = resetTime - currentTime;

    console.log(`Quase atingindo o limite de taxa. Aguardando ${Math.ceil(waitTime / 1000)} segundos até o reset...`);
    await new Promise(resolve => setTimeout(resolve, waitTime)); // Aguarda até o reset
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

// Função para verificar os limites após a execução
async function checkRateLimit() {
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
  maxConcurrent: 1,  // Apenas uma requisição por vez
  minTime: 60000     // Aguardar 60 segundos entre cada requisição de busca de código
});

// Função para buscar repositórios de um usuário com o limitador
async function fetchReposWithLimiter(username, keyword) {
  await checkAndHandleRateLimit();  // Verificar limites de requisições gerais antes de buscar
  await limiter.schedule(() => searchTopReposByStars(username, keyword));
}

// Função para buscar os 5 repositórios mais populares (ordenados por estrelas)
async function searchTopReposByStars(username, keyword) {
  try {
    // Busca os repositórios do usuário, ordenados pelo número de estrelas
    const repos = await octokit.search.repos({
      q: `user:${username}`,  // Buscar pelos repositórios do usuário
      sort: 'stars',  // Ordenar pelos repositórios com mais estrelas
      order: 'desc',  // Ordem decrescente (maior para menor)
      per_page: 10  // Limitar para os 10 primeiros resultados
    });

    // Verificar se o usuário tem repositórios
    if (repos.data.items.length === 0) {
      console.log(`Usuário ${username} não possui repositórios.`);
      return;
    }

    for (const repo of repos.data.items) {
      const repoFullName = repo.full_name;
      console.log(`Verificando repositório: ${repoFullName}`);

      // Verificar limite de busca de código antes de realizar a busca
      await checkAndHandleCodeSearchRateLimit();

      // Procurar o termo dentro do repositório
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
        console.log(`Nenhuma ocorrência de "${keyword}" no repositório ${repoFullName}`);
      }
    }
  } catch (error) {
    console.error(`Erro ao buscar repositórios de ${username}:`, error);
  }
}

// Função para buscar perfis com mais de 10.000 seguidores, começando de uma página aleatória
async function getRandomUsersAndSearchWithLimiter(keyword) {
  try {
    const totalPages = 100; // Número máximo de páginas que a busca pode ter (ajustar conforme necessário)
    const randomPage = Math.floor(Math.random() * totalPages) + 1; // Escolher uma página aleatória entre 1 e totalPages

    const users = await octokit.search.users({
      q: 'followers:>10000',  // Procurar por usuários com mais de 10.000 seguidores
      per_page: 5,
      page: randomPage,       // Começar da página aleatória
      sort: 'followers',      // Ordena os usuários pelo número de seguidores
      order: 'desc',          // Ordem decrescente (usuários com mais seguidores primeiro)
    });

    // Para cada usuário encontrado, usar o limitador para buscar repositórios
    await Promise.all(users.data.items.map(async (user) => {
      console.log(`Verificando usuário: ${user.login}`);
      await fetchReposWithLimiter(user.login, keyword); // Limitar as requisições
    }));
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
  }
}

// Função principal para rodar o script
async function main() {
  // Palavra a ser buscada (múltiplas palavras-chave)
  const keyword = "API_KEY OR API_SECRET OR ACCESS_KEY OR PASSWORD OR ACCESS_TOKEN OR SECRET_KEY OR DB_PASSWORD OR DB_USER OR DATABASE_URL OR PROD_DB_PASSWORD OR PRODUCTION_API_KEY OR PRIVATE_KEY OR SSL_CERT OR TLS_KEY OR AWS_ACCESS_KEY_ID OR AWS_SECRET_ACCESS_KEY OR AWS_SESSION_TOKEN OR AZURE_CLIENT_ID OR AZURE_SECRET OR GCP_CREDENTIALS OR GCP_API_KEY OR ADMIN_PASSWORD OR EMAIL_PASSWORD OR MYSQL_PASSWORD OR PG_PASSWORD OR BEARER_TOKEN OR AUTH_TOKEN";

  // Iniciar busca por perfis com mais de 10.000 seguidores e procurar a palavra, com limite de requisições
  await getRandomUsersAndSearchWithLimiter(keyword);

  // Checar limites de requisições após a execução (opcional)
  await checkRateLimit();
}

// Chamar a função principal
main().catch(console.error);

