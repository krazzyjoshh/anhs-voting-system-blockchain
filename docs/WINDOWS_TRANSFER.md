# Moving ANHS Vote to Windows 10/11

These steps move the existing application and election data. They use the deployed Solana program and do not require rebuilding or redeploying it.

## Install on the new laptop

- Node.js 24 LTS, including npm: https://nodejs.org/en/download
- A browser, such as Edge or Chrome.
- Optional: Visual Studio Code to edit configuration and open a terminal.
- Optional: Git, if you want to use Git for source control.

A separate SQLite server, MySQL, XAMPP, Rust, Anchor CLI, and Solana CLI are not required to run the existing web app. Its SQLite library and blockchain client are installed through npm. Rust/Anchor/Solana development tools are needed only if you later build or redeploy the blockchain program.

The project was tested with Node.js 24.10.0. Its installed better-sqlite3 package requires Node >=22, and Vite requires Node ^20.19.0 or >=22.12.0. Node 24 LTS meets both requirements.

## Before copying from the old laptop

1. Finish any current publishing or voting operation, then stop all running application servers with Ctrl+C in their terminals. Keep them stopped while copying. Do not run two writable copies for the same election after migration.
2. Make a backup of the project before moving it.
3. Copy the project folder to a private USB drive or another private transfer location. You may omit every node_modules directory, .browser-tools, and web/dist; these are local dependencies/build artifacts.
4. Ensure these files are included:

   - package.json and package-lock.json in the project root.
   - web/ and server/, including their package.json and package-lock.json files.
   - server/.env: existing configuration and secrets.
   - server/data.sqlite: current students, candidates, tokens, receipts, admin accounts, and settings.
   - server/data.sqlite-wal and server/data.sqlite-shm, if present after shutdown. Keep the database files together. The WAL may contain changes not yet written to the main database file; do not copy only the main file while the app is running.
   - chain/target/idl/voting_system.json: required at runtime by server/src/chain.js. You do not need the entire generated chain/target directory to run the web app, but you must retain this IDL.

5. Separately transfer the existing wallet JSON named by WALLET_PATH in server/.env. In the reviewed setup, it is /home/krazzjoshh/.config/solana/id.json, outside the project folder. Transfer it privately and store it outside the project on Windows, for example C:\Users\YOUR_NAME\.config\solana\id.json. Do not paste its contents into chat or upload it to a public repository.

If DB_PATH is configured in your actual .env, transfer that database instead of assuming server/data.sqlite.

For a GitHub transfer, clone the source repository and separately restore the private files above. The runtime IDL is explicitly included in the initial source commit even though generated target directories are ignored. A Git clone does not include .env, SQLite data, wallet keys, or uncommitted files. Use a private transfer for these files and preserve the original TOKEN_PEPPER.

## Configure Windows

Extract/copy the project to a simple local path, for example:

C:\Projects\anhs-chain-vote

Open server/.env in an editor. Preserve the existing settings and secret values. Change WALLET_PATH to the location of the copied wallet using forward slashes:

```dotenv
WALLET_PATH=C:/Users/YOUR_NAME/.config/solana/id.json
```

If DB_PATH is configured, update that path too. Keeping the default database location requires no DB_PATH setting.

Keep TOKEN_PEPPER exactly the same: it determines the identifiers for existing registered voting tokens. Use the same wallet, RPC network, and IDL/program address to continue the same election. Copy the real .env; do not replace it with placeholder values from .env.example.

Keep PORT=4000 unless you also change the proxy in web/vite.config.js. That proxy currently sends API requests to http://127.0.0.1:4000.

Existing admin credentials remain stored in the copied SQLite database. Editing ADMIN_EMAIL/ADMIN_PASSWORD does not reset an existing admin account; these settings create the first admin only when the admin table is empty.

## Install dependencies and start

Open Command Prompt or the VS Code terminal in the project root:

```bat
cd C:\Projects\anhs-chain-vote
node --version
npm --version
npm ci
npm --prefix server ci
npm --prefix web ci
npm run dev
```

Install dependencies on Windows instead of copying Linux node_modules. better-sqlite3 includes native code, and its binaries depend on the operating system and Node version.

If PowerShell blocks npm.ps1, use Command Prompt or replace npm with npm.cmd in these commands.

Open:

- Application: http://127.0.0.1:5173
- Admin login: http://127.0.0.1:5173/admin/login
- API health check: http://127.0.0.1:4000/api/health

Use the active frontend in web/, not the old server/web/ folder.

Internet access is needed to install packages and connect to Solana Devnet. The wallet retains its on-chain balance because you copied the same keypair; moving laptops does not require creating a new wallet or publishing the election again.

## Check the transfer

- The API health endpoint returns an object with ok: true.
- Existing admin credentials work.
- Existing student records, candidates, tokens, election status, and receipts are present.
- The Blockchain page can read the expected program/election and wallet balance.

These checks do not require casting a vote or creating a new election.

Optional local validation:

```bat
npm --prefix web run build
npm --prefix server test
```

The existing server tests use isolated test data and mocked blockchain operations.

## If installation fails

For better-sqlite3/native-module errors, first confirm Node 24 LTS is installed and use a project path without spaces. If the installer needs to compile a native module, the better-sqlite3 troubleshooting guide recommends the Node.js installer option "Automatically install the necessary tools" on Windows. Follow the error output if Python or Visual Studio C++ Build Tools are still missing; these are conditional build requirements, not additional services for the app.

If the app starts but blockchain reads fail, check that the IDL and wallet file exist, WALLET_PATH matches Windows, the original TOKEN_PEPPER was retained, and internet/RPC access works.

References:

- Node.js download: https://nodejs.org/en/download
- better-sqlite3 troubleshooting: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md
