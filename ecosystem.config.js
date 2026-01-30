
const path = require('path');

require('dotenv').config({ override: true, path: path.resolve(__dirname, '.env') }); // Load environment variables from .env file

const hub_port = process.env.SPINALHUB_PORT

module.exports = {
  apps: [
    {
      name: `spinal-organ-connector-charge_unix-${hub_port}`,
      script: "index.js",
      cwd: "."
    },
  ],
};

