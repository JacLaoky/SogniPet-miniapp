import { SogniClient } from '@sogni-ai/sogni-client';
import type { SogniClient as SogniClientType } from '@sogni-ai/sogni-client';

let client: SogniClientType | null = null;

async function initializeClient(): Promise<SogniClientType> {
  if (!process.env.SOGNI_APP_ID || !process.env.SOGNI_USERNAME || !process.env.SOGNI_PASSWORD) {
    throw new Error('Sogni credentials are not set in .env.local');
  }

  const options = {
    appId: process.env.SOGNI_APP_ID,
    network: 'fast' as const,
  };

  const newClient = await SogniClient.createInstance(options);
  await newClient.account.login(process.env.SOGNI_USERNAME, process.env.SOGNI_PASSWORD);
  await newClient.projects.waitForModels();
  return newClient;
}

export async function getSogniClient(): Promise<SogniClientType> {
  if (!client) {
    console.log('Initializing new Sogni client...');
    client = await initializeClient();
  }
  
  return client;
}