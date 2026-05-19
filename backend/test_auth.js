const axios = require('axios');

async function test() {
  try {
    console.log('Logging in...');
    const res1 = await axios.post('http://localhost:5000/auth/fpo-login', {
      username: 'fpo_nagpur',
      password: 'fpo_nagpur_123'
    });
    console.log('Login successful:', res1.data.token);
    
    console.log('Calling /auth/me...');
    const res2 = await axios.get('http://localhost:5000/auth/me', {
      headers: { Authorization: `Bearer ${res1.data.token}` }
    });
    console.log('/auth/me response:', res2.data);
    
    console.log('Calling /fpo/farms...');
    const res3 = await axios.get('http://localhost:5000/fpo/farms', {
      headers: { Authorization: `Bearer ${res1.data.token}` }
    });
    console.log('/fpo/farms response length:', res3.data.farms.length);
    
  } catch (err) {
    console.error('Error:', err.response ? err.response.data : err.message);
    if (err.response) console.error('Status:', err.response.status);
  }
}

test();
