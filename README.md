# Search Sensitive Tool


Tool that scans all random githubs profiles looking for keywords that link to sensitive data.

## References

 - [Github Oktokit API](https://github.com/octokit)


## Running locally

1. Clone the project

```bash
  https://github.com/weillercarvalho/SST
```

2. Enter the project directory

3. Install dependencies

```bash
  npm i
```
4. Configure the necessary github tokens to trigger Github API endpoints (If you analyze the script.js file, I used five(5) github tokens, but you can configure the use of just one(1), remembering that you will need to change the code for this to run normally).

5. Run the script

```bash
  node script.js
```
Extra Informations:

6. Github Action is already pre-configured to run a workflow automatically every 15 minutes if you want to clone/fork the project to your machine.

7. These are the keywords currently searched for, if you want to change, change the script.js file
```bash
     "API_KEY", "API_SECRET", "ACCESS_KEY", "ACCESS_TOKEN", "SECRET_KEY",
    "DB_PASSWORD", "DB_USER", "PRODUCTION_API_KEY",
    "PRIVATE_KEY", "SSL_CERT", "TLS_KEY", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN", "AZURE_CLIENT_ID", "AZURE_SECRET", "GCP_CREDENTIALS",
    "GCP_API_KEY", "ADMIN_PASSWORD", "EMAIL_PASSWORD", "MYSQL_PASSWORD", "PG_PASSWORD",
    "BEARER_TOKEN", "AUTH_TOKEN", "CREDENTIALS", "TOKEN", "PASSWORD_HASH", "ENCRYPTION_KEY", "CLIENT_SECRET", "SECRET_TOKEN", "APP_SECRET", "JWT_SECRET",
    "OAUTH_TOKEN", "SSH_KEY", "SSH_PRIVATE_KEY", "CLOUD_SECRET", "AUTH_KEY", "AUTH_SECRET", "POSTGRES_PASSWORD", "MONGO_PASSWORD", "ELASTIC_PASSWORD",
    "API_TOKEN", "API_PRIVATE_KEY", "GOOGLE_API_KEY", "GITHUB_TOKEN", "BITBUCKET_TOKEN", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "DOCKER_PASSWORD", "DOCKER_TOKEN"
```

## Enjoy 🚀


![e7b4ce09c703210ab8f75b017c7eaf0951c5a95b737ee8120602845c1c1d944b](https://github.com/user-attachments/assets/2016eb76-2156-4a87-a7be-6fcf079189f3)
