import { NextResponse } from 'next/server';
import { getSogniClient } from '@/lib/sogni-client';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { sogniPetABI } from '@/lib/abi';

const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

const FREE_PROMPT_LIMIT = 10;
const PREMIUM_PROMPT_LIMIT = 5000;

const rpcUrl = process.env.BASE_SEPOLIA_RPCURL; 

export async function POST(request: Request) {
  const { prompt, modelId, userAddress } = await request.json();

  if (!prompt || !userAddress) {
    return NextResponse.json({ error: 'Prompt and userAddress are required' }, { status: 400 });
  }

  if (!rpcUrl) {
    console.error("RPC URL is not configured in environment variables.");
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  
  try {
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(rpcUrl),
    });

    const isPremium = await publicClient.readContract({
      address: contractAddress,
      abi: sogniPetABI,
      functionName: 'isPremiumUser',
      args: [userAddress],
    });

    const promptLimit = isPremium ? PREMIUM_PROMPT_LIMIT : FREE_PROMPT_LIMIT;
    if (prompt.length > promptLimit) {
      return NextResponse.json(
        { 
          error: `Prompt is too long. Your limit is ${promptLimit} characters. Upgrade to premium for a higher limit.` 
        }, 
        { status: 403 }
      );
    }

    const client = await getSogniClient();

    const mostPopularModel = client.projects.availableModels.reduce((a, b) =>
      a.workerCount > b.workerCount ? a : b
    );

    let modelIdToUse = mostPopularModel.id;

    if (modelId && modelId !== mostPopularModel.id) {
      if (!isPremium) {
        return NextResponse.json({ error: 'You must pay to unlock this model' }, { status: 403 });
      }
      modelIdToUse = modelId;
    }

    const project = await client.projects.create({
      modelId: modelIdToUse,
      positivePrompt: prompt,
      negativePrompt: 'malformation, bad anatomy, bad hands, cropped, low quality',
      stylePrompt: '',
      tokenType: 'spark',
      steps:  50,
      guidance: 7.5,
      numberOfImages: 1,
    });

    // Wait for the entire project (our single image) to complete
    const imageUrls = await project.waitForCompletion();

    if (!imageUrls || imageUrls.length === 0) {
      throw new Error('Image generation failed, no URLs returned.');
    }

    // Return the first image URL
    return NextResponse.json({ imageUrl: imageUrls[0] });

  } catch (error) {
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to generate image', details: errorMessage }, { status: 500 });
  }
}