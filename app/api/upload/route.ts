import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    if (!process.env.PINATA_JWT) {
    return NextResponse.json({ error: 'Pinata JWT not set' }, { status: 500 });
  }

  const { imageUrl, prompt } = await request.json();

  if (!imageUrl || !prompt) {
    return NextResponse.json({ error: 'imageUrl and prompt are required' }, { status: 400 });
  }

  try {
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to fetch image from Sogni URL');
    }
    const imageBlob = await imageResponse.blob();

    const imageData = new FormData();
    imageData.append('file', imageBlob);
    
    const imageUploadResponse = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${process.env.PINATA_JWT}` 
      },
      body: imageData,
    });
    
    if (!imageUploadResponse.ok) {
      const errorBody = await imageUploadResponse.json();
      throw new Error(`Pinata image upload failed: ${errorBody.error?.details || imageUploadResponse.statusText}`);
    }
    const { IpfsHash: imageHash } = await imageUploadResponse.json();

    const metadata = {
      name: `SogniPet: ${prompt.substring(0, 20)}...`,
      description: prompt,
      image: `ipfs://${imageHash}`,
    };

    const jsonUploadResponse = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.PINATA_JWT}`,
      },
      body: JSON.stringify(metadata),
    });

    if (!jsonUploadResponse.ok) {
      const errorBody = await jsonUploadResponse.json();
      throw new Error(`Pinata JSON upload failed: ${errorBody.error?.details || jsonUploadResponse.statusText}`);
    }
    const { IpfsHash: metadataHash } = await jsonUploadResponse.json();

    const metadataUri = `ipfs://${metadataHash}`;
    return NextResponse.json({ metadataUri });

  } catch (error) {
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
}