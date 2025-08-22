import { NextResponse } from 'next/server';
import { getSogniClient } from '@/lib/sogni-client';

export async function GET() {
  try {
    const client = await getSogniClient();
    
    const availableModels = client.projects.availableModels;

    return NextResponse.json({ models: availableModels });

  } catch (error) {
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to fetch models', details: errorMessage }, { status: 500 });
  }
}