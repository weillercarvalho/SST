import { Octokit } from "@octokit/rest";
import dotenv from "dotenv";
dotenv.config();

const tokens = [
  process.env.GITHUB_TOKEN1,
  process.env.GITHUB_TOKEN2,
  process.env.GITHUB_TOKEN3,
  process.env.GITHUB_TOKEN4,
  process.env.GITHUB_TOKEN5
];

// Função para testar a autenticação de cada token
async function testAuthentication() {
  for (let i = 0; i < tokens.length; i++) {
    const octokit = new Octokit({ auth: tokens[i] });
    try {
      const { data } = await octokit.rest.users.getAuthenticated();
      console.log(`Token ${i + 1} autenticado como: ${data.login}`);
    } catch (error) {
      console.error(`Falha na autenticação do token ${i + 1}:`, error.message);
    }
  }
}

// Chamar a função de teste
testAuthentication();
