module.exports = { testDir:'./tests', use:{channel:'chrome',headless:true}, webServer:{command:'node tests/server.js',port:4178,reuseExistingServer:!process.env.CI}, workers:1 };

