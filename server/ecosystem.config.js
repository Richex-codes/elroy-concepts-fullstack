module.exports = {
  apps: [
    {
      name: "elroy-server",
      script: "index.js",
      env: {
        NODE_ENV: "production",
      }
    },
    {
      name: "enquiry-worker",
      script: "jobs/worker.js",
      env: {
        NODE_ENV: "production",
      }
    },
    {
      name: "inventory-worker",
      script: "jobs/inventoryWorker.js",
      env: {
        NODE_ENV: "production",
      }
    }
  ]
};
