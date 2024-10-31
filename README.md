# Search Sensitive Tool


Tool that scans all random githubs profiles looking/scanning for .env files.

## References

 - [Github Oktokit API](https://github.com/octokit)


## Running locally

1. Clone the project.

```bash
  https://github.com/weillercarvalho/SST
```

2. Enter the project directory.

3. Install dependencies.

```bash
  npm i
```
4. Configure the necessary github tokens to trigger Github API endpoints (If you analyze the script.js file, I used five(5) github tokens, but you can configure the use of just one(1), remembering that you will need to change the code for this to run normally).

5. Run the script.

```bash
  node script.js
```
Extra Informations:

6. Github Action is already pre-configured to run a workflow automatically every 15 minutes if you want to clone/fork the project to your machine.

7. If you want to test whether your tokens are working correctly after setting them, run the file below.
   
```bash
 node testauth.js
```
8. The Node.js version used was v20.12.2

   
## Enjoy 🚀


![e7b4ce09c703210ab8f75b017c7eaf0951c5a95b737ee8120602845c1c1d944b](https://github.com/user-attachments/assets/2016eb76-2156-4a87-a7be-6fcf079189f3)
