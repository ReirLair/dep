const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 7860;

// Function to generate a space name with 9 characters
const generateSpaceName = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return `rk${Array.from({ length: 9 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('')}`;
};

// Function to retry a Puppeteer action
const retry = async (fn, retries = 3) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === retries) throw error;
        }
    }
};

app.get('/create-space', async (req, res) => {
    const username = 'rkservers'; // Update with Hugging Face username
    const password = '@Ogombo247'; // Update with Hugging Face password
    const spaceName = generateSpaceName();

    const browser = await puppeteer.launch({
    headless: true,
    executablePath: "/usr/bin/google-chrome",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
});
    const page = await browser.newPage();

    const dockerfileContent = `
    FROM python:3.10

WORKDIR /root

RUN apt-get update && apt-get install -y sudo git curl

RUN mkdir -p /root/.local /root/.cache/pip  
RUN chmod -R 777 /root

ENV PATH="/root/bin:$PATH"  
ENV PYTHONUSERBASE=/root  
ENV PIP_CACHE_DIR=/root/.cache/pip

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash -  
RUN apt-get install -y nodejs  
RUN npm install -g npm@latest

RUN mkdir -p /root/.npm-global /root/.npm-global/.cache /root/.config  
RUN chmod -R 777 /root

ENV NPM_CONFIG_PREFIX="/root/.npm-global"  
ENV NPM_CONFIG_CACHE="/root/.npm-global/.cache"  
ENV PATH="/root/.npm-global/bin:$PATH"

RUN mkdir -p /app/node_modules  
RUN chmod -R 777 /app/node_modules

WORKDIR /app
RUN git clone https://github.com/ReirLair/reikerpy.git .

RUN pip install --upgrade pip  
RUN pip install --no-cache-dir --root-user-action=ignore -r requirements.txt

RUN chmod -R 777 /app

EXPOSE 7860

CMD ["python", "server.py"]
`;

    try {
        /*** LOGIN ***/
        await retry(() => page.goto('https://huggingface.co/login', { waitUntil: 'networkidle2' }));
        await retry(() => page.type('input[name="username"]', username));
        await retry(() => page.type('input[name="password"]', password));
        await retry(() => Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            page.click('button[type="submit"]')
        ]));

        /*** CREATE NEW SPACE ***/
        await retry(() => page.goto('https://huggingface.co/new-space', { waitUntil: 'networkidle2' }));
        await retry(() => page.type('input[placeholder="New Space name"]', spaceName));

        // Select Docker as SDK
        await retry(() => page.click('label:has(input[value="docker"])'));

        // Create Space
        await retry(() => page.click('button[type="submit"]'));
        await retry(() => page.waitForNavigation({ waitUntil: 'networkidle2' }));

        /*** NAVIGATE TO REPO ***/
        const repoUrl = `https://huggingface.co/spaces/${username}/${spaceName}/new/main`;
        await retry(() => page.goto(repoUrl, { waitUntil: 'networkidle2' }));

        /*** CREATE DOCKERFILE ***/
        await retry(() => page.type('input[name="filename"]', 'Dockerfile'));
        await retry(() => page.type('div[contenteditable="true"]', dockerfileContent));
        await retry(() => page.type('input[name="summary"]', 'Added Dockerfile'));

        // Commit file
        await retry(() => page.click('button[type="submit"]'));
        await retry(() => page.waitForNavigation({ waitUntil: 'networkidle2' }));

        /*** RETRIEVE DEPLOYED SPACE URL ***/
        const spaceURL = `https://${username}-${spaceName}.hf.space`;

        console.log(`Space URL: ${spaceURL}`);

        res.json({
            success: true,
            message: 'Space Created Successfully',
            spaceURL,
            owner: 'Reiker'
        });

    } catch (error) {
        console.error("Failed:", error.message);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        await browser.close();
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
