import fs from 'fs';

const localConfig = fs.readFileSync('./src/config/local-config.js', 'utf8');
const urlMatch = localConfig.match(/HA_URL = "(.*?)"/);
const tokenMatch = localConfig.match(/HA_TOKEN = "(.*?)"/);

if (urlMatch && tokenMatch) {
    const url = urlMatch[1];
    const token = tokenMatch[1];
    fetch(url + '/api/services', {
        headers: { 'Authorization': 'Bearer ' + token }
    }).then(res => res.json()).then(data => {
        const todo = data.find(s => s.domain === 'todo');
        console.log(JSON.stringify(todo, null, 2));
    }).catch(console.error);
} else {
    console.log("Could not parse url or token");
}
