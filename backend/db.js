const { Pool } = require('pg');
const dns = require('dns');
require('dotenv').config();

// Custom DNS fallback resolver for Neon DB connection in restricted DNS environments
const resolver = new dns.Resolver();
resolver.setServers(['8.8.8.8', '8.8.4.4']);

const originalLookup = dns.lookup;
dns.lookup = function (hostname, options, callback) {
  let cb = callback;
  let opts = options;
  if (typeof options === 'function') {
    cb = options;
    opts = {};
  }
  
  if (hostname && hostname.includes('neon.tech')) {
    resolver.resolve4(hostname, (err, addresses) => {
      if (err || addresses.length === 0) {
        originalLookup(hostname, opts, cb);
      } else {
        if (opts && opts.all) {
          cb(null, addresses.map(addr => ({ address: addr, family: 4 })));
        } else {
          cb(null, addresses[0], 4);
        }
      }
    });
  } else {
    originalLookup(hostname, opts, cb);
  }
};

const isCloud = process.env.DB_HOST && !process.env.DB_HOST.includes('localhost');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // SSL required for Neon.tech and other cloud PostgreSQL providers
  // Automatically disabled for localhost (your local pgAdmin stays unaffected)
  ssl: isCloud ? { rejectUnauthorized: false } : false,
});

// Test the connection when the server starts
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
  } else {
    console.log('✅ PostgreSQL connected successfully');
    release(); // return connection back to pool
  }
});

// Export pool so any route file can use it to query the database
module.exports = pool;
