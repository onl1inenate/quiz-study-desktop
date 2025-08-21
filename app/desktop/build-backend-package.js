const fs = require('fs');
const pkg = {
  type: 'module',
  dependencies: {
    openai: '^5.13.1',
    zod: '^3.23.8',
    'better-sqlite3': '^9.6.0',
    express: '^4.19.2',
    dotenv: '^16.4.5',
    cors: '^2.8.5',
    uuid: '^9.0.1',
  },
};
fs.writeFileSync('resources/backend/package.json', JSON.stringify(pkg, null, 2));
