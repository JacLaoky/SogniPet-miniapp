'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import { useState, useEffect } from 'react';
import { Wallet, ConnectWallet, WalletDropdown, WalletDropdownDisconnect } from '@coinbase/onchainkit/wallet';
import { Name, Identity, Address, Avatar, EthBalance } from '@coinbase/onchainkit/identity';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { sogniPetABI } from '../lib/abi';

const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

interface SogniModel {
  id: string;
  name: string;
  workerCount: number;
}

export default function Home() {
  const FREE_PROMPT_LIMIT = 10;
  const PREMIUM_PROMPT_LIMIT = 5000;

  const [prompt, setPrompt] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const [models, setModels] = useState<SogniModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');

  const [myPets, setMyPets] = useState<{ id: number; image: string; name: string }[]>([]);
  const [isLoadingPets, setIsLoadingPets] = useState<boolean>(false);

  const { address, isConnected } = useAccount();

  const { data: totalSupplyData } = useReadContract({
    address: contractAddress,
    abi: sogniPetABI,
    functionName: 'totalSupply'
  });
  const totalSupply = totalSupplyData ? Number(totalSupplyData) : 0;

  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

const { data: isPremium, status: premiumStatus, refetch: refetchPremiumStatus } = useReadContract({
    address: contractAddress,
    abi: sogniPetABI,
    functionName: 'isPremiumUser',
    args: address ? [address] : undefined,
    query: { 
      enabled: !!address,
    }, 
  });

  const currentPromptLimit = isPremium ? PREMIUM_PROMPT_LIMIT : FREE_PROMPT_LIMIT;
  const isOverLimit = prompt.length > currentPromptLimit;
  const { data: unlockHash, writeContract: unlockContract } = useWriteContract();

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch('/api/models');
        if (!response.ok) {
          throw new Error('Failed to fetch models from server');
        }
        const data = await response.json();
        const loadedModels = data.models as SogniModel[];
        setModels(loadedModels);
        // Set the default model to the most popular one if models are loaded
        if (loadedModels && loadedModels.length > 0) {
          const mostPopularModel = loadedModels.reduce((a, b) =>
            a.workerCount > b.workerCount ? a : b
          );
          setSelectedModel(mostPopularModel.id);
        }
      } catch (err) {
        console.error(err);
        setStatusMessage('Could not load AI models.');
      }
    };

    fetchModels();
  }, []);

  const handleGenerate = async () => {
    if (!prompt) {
      alert('Please enter a description for your pet.');
      return;
    }
    if (!selectedModel) {
      alert('Please select a model.');
      return;
    }
    setIsGenerating(true);
    setStatusMessage('Generating your pet with Sogni AI...');
    setImageUrl('');

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send the selected modelId along with the prompt
        body: JSON.stringify({ prompt, modelId: selectedModel }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate image');
      }

      const data = await response.json();
      setImageUrl(data.imageUrl);
      setStatusMessage('Image generated successfully!');
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setStatusMessage(`Error: ${errorMessage}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleMint = async () => {
    if (!imageUrl || !prompt || !address) {
      alert('Missing required information to mint.');
      return;
    }

    setStatusMessage('Uploading image and metadata to IPFS...');
    try {
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, prompt }),
      });
      
      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.error || 'Failed to upload to IPFS');
      }
      
      const { metadataUri } = await uploadResponse.json();

      if (!metadataUri) {
        throw new Error('Failed to get metadata URI from the server.');
      }

      setStatusMessage('Please confirm the transaction in your wallet...');
      
      writeContract({
        address: contractAddress,
        abi: sogniPetABI,
        functionName: 'safeMint',
        args: [address, metadataUri],
      });

    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setStatusMessage(`Error: ${errorMessage}`);
    }
  };

  const handleUnlock = () => {
      const price = 10000000000000; // 0.00001 ETH in wei
      
      unlockContract({
          address: contractAddress,
          abi: sogniPetABI,
          functionName: 'payToUnlock',
          value: BigInt(price),
      });
  };

  const { isSuccess: isUnlockConfirmed } = useWaitForTransactionReceipt({ hash: unlockHash });
  useEffect(() => {
    if (isUnlockConfirmed) {
      refetchPremiumStatus(); 
    }
  }, [isUnlockConfirmed, refetchPremiumStatus]);


  const ownerCalls = Array.from({ length: totalSupply }, (_, i) => ({
    address: contractAddress,
    abi: sogniPetABI,
    functionName: 'ownerOf',
    args: [BigInt(i)],
  }));

  const { data: ownersData } = useReadContracts({
    contracts: ownerCalls,
  });

  const ownedTokenIds = ownersData
    ? ownersData
        .map((ownerResult, index) =>
          ownerResult.result === address ? index : -1
        )
        .filter((id) => id !== -1)
    : [];

  const uriCalls = ownedTokenIds.map((id) => ({
    address: contractAddress,
    abi: sogniPetABI,
    functionName: 'tokenURI',
    args: [BigInt(id)],
  }));

  const { data: urisData } = useReadContracts({
    contracts: uriCalls,
  });
  
  useEffect(() => {
    if (isConfirming) {
      setStatusMessage('Transaction submitted, waiting for confirmation...');
    } else if (isConfirmed) {
      setStatusMessage('Mint successful! Your SogniPet is now on-chain.');
      setImageUrl('');
      setPrompt('');
    } else if (error) {
      setStatusMessage(`Minting failed: ${error.message}`);
    }
  }, [isConfirming, isConfirmed, error]);

useEffect(() => {
  const fetchMetadata = async () => {
    if (urisData && urisData.length > 0) {
      setIsLoadingPets(true);
      
      const petPromises = urisData.map(async (uriResult, index) => {
        if (uriResult.status === 'success') {
          const metadataUrl = (uriResult.result as string).replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
          console.log("Attempting to fetch metadata from:", metadataUrl);
          const response = await fetch(metadataUrl);
          const metadata = await response.json();
          return {
            id: ownedTokenIds[index],
            name: metadata.name,
            image: (metadata.image as string).replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/'),
          };
        }
        return null;
      });

      const resolvedPets = (await Promise.all(petPromises)).filter(p => p !== null);
      setMyPets(resolvedPets as { id: number; image: string; name: string }[]);
      setIsLoadingPets(false);
    } else if (!urisData) {
      setMyPets([]);
    }
  };

  fetchMetadata();
}, [urisData, ownedTokenIds]);

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <h1 style={styles.title}>SogniPet AI Creator</h1>
        <p style={styles.subtitle}>Create and own your unique AI-generated pet on Base.</p>
        
        {isConnected && premiumStatus === 'success' && (
          <div style={styles.badgeContainer}>
            {isPremium ? (
              <span style={{...styles.statusBadge, ...styles.premiumBadge}}>
                ⭐ Premium User
              </span>
            ) : (
              <span style={{...styles.statusBadge, ...styles.freeBadge}}>
                Free User
              </span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
          <Wallet>
            <ConnectWallet>
              <Avatar className="h-6 w-6" />
              <Name />
            </ConnectWallet>
            <WalletDropdown>
              <Identity>
                <Avatar />
                <Name />
                <Address />
                <EthBalance />
              </Identity>
              <WalletDropdownDisconnect />
            </WalletDropdown>
          </Wallet>
        </div>

        {isConnected && (
              <div style={styles.galleryZone}>
                <h3 style={styles.stepTitle}>My SogniPets Collection</h3>
                {isLoadingPets && <p>Loading your pets...</p>}
                {!isLoadingPets && myPets.length > 0 && (
                  <div style={styles.petsGrid}>
                    {myPets.map(pet => (
                      <div key={pet.id} style={styles.petCard}>
                        <img src={pet.image} alt={pet.name} style={styles.petImage} />
                        <p style={styles.petId}>Pet ID: {pet.id}</p>
                      </div>
                    ))}
                  </div>
                )}
                {!isLoadingPets && myPets.length === 0 && (
                  <p>You do not own any SogniPets yet. Go create one!</p>
                )}
              </div>
            )}

        {isConnected && (
          <div style={styles.creatorZone}>
            <div style={styles.step}>
              <h3 style={styles.stepTitle}>Describe Your Dream Pet</h3>
              <div style={styles.inputGroup}>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  style={styles.select}
                  disabled={!isPremium || isGenerating || isPending || isConfirming || models.length === 0}
                >
                  {models.length > 0 ? (
                    models.map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name} ({model.workerCount} Workers)
                      </option>
                    ))
                  ) : (
                    <option>Loading models...</option>
                  )}
                </select>
                {!isPremium && isConnected && (
                  <div>
                    <p style={{ color: '#d97706', marginBottom: '0.5rem' }}>
                      Pay a small fee to unlock all AI models and premium features.
                    </p>
                    <button onClick={handleUnlock} style={styles.unlockButton}>
                      Unlock
                    </button>
                  </div>
                )}
              </div>

              <div style={styles.inputGroup}>
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., A cyber punk cat with neon wings"
                  style={{...styles.input, borderColor: isOverLimit ? 'red' : '#ccc'}}
                  disabled={isGenerating || isPending || isConfirming}
                />
                <button 
                  onClick={handleGenerate} 
                  style={styles.button}
                  disabled={isGenerating || isPending || isConfirming || isOverLimit || !prompt}
                >
                  {isGenerating ? 'Generating...' : 'Generate Image'}
                </button>
              </div>
              <p style={{ 
                color: isOverLimit ? 'red' : '#666', 
                textAlign: 'right', 
                marginTop: '0.5rem',
                fontSize: '0.9rem'
              }}>
                {prompt.length} / {currentPromptLimit}
              </p>
            </div>

            {imageUrl && (
              <div style={styles.step}>
                <h3 style={styles.stepTitle}>Mint Your Creation</h3>
                <img src={imageUrl} alt="Generated Pet" style={styles.imagePreview} />
                <button 
                  onClick={handleMint} 
                  style={styles.button}
                  disabled={isPending || isConfirming}
                >
                  {isPending ? 'Waiting for wallet...' : (isConfirming ? 'Minting...' : 'Mint as NFT')}
                </button>
              </div>
            )}
            
            {statusMessage && (
              <div style={styles.statusBox}>
                <p>{statusMessage}</p>
                {hash && (
                  <p style={{ wordBreak: 'break-all' }}>
                    Tx Hash: <a href={`https://sepolia.basescan.org/tx/${hash}`} target="_blank" rel="noopener noreferrer">{hash}</a>
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  main: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#f0f2f5',
    padding: '2rem',
  },
  container: {
    width: '100%',
    maxWidth: '600px',
    backgroundColor: '#ffffff',
    padding: '2rem',
    borderRadius: '16px',
    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
    textAlign: 'center',
  },
  title: {
    fontSize: '2.5rem',
    fontWeight: 'bold',
    color: '#1a1a1a',
    margin: 0,
  },
  subtitle: {
    fontSize: '1.1rem',
    color: '#666',
    marginBottom: '2rem',
  },
   badgeContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '1rem',
  },
  statusBadge: {
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
  },
  premiumBadge: {
    backgroundColor: '#fef3c7',
    color: '#b45309',
  },
  freeBadge: {
    backgroundColor: '#e5e7eb',
    color: '#4b5563',
  },
  creatorZone: {
    marginTop: '2rem',
  },
  step: {
    marginBottom: '2rem',
  },
  stepTitle: {
    color: '#333',
    borderBottom: '1px solid #eee',
    paddingBottom: '0.5rem',
    marginBottom: '1rem',
  },
  inputGroup: {
    display: 'flex',
    gap: '0.5rem',
  },
  input: {
    flexGrow: 1,
    padding: '0.75rem',
    fontSize: '1rem',
    border: '1px solid #ccc',
    borderRadius: '8px',
    color: '#1a1a1a',
  },
  button: {
    padding: '0.75rem 1.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: '#0052ff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  unlockButton: {
    padding: '0.5rem 1rem',
    fontSize: '0.9rem',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: '#f59e0b',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    width: '100%',
  },
  imagePreview: {
    maxWidth: '100%',
    height: 'auto',
    borderRadius: '8px',
    border: '1px solid #ddd',
    marginBottom: '1rem',
  },
  statusBox: {
    marginTop: '1.5rem',
    padding: '1rem',
    backgroundColor: '#eef2ff',
    borderRadius: '8px',
    color: '#333',
    fontSize: '0.9rem',
    wordWrap: 'break-word',
  },
  galleryZone: {
    marginTop: '3rem',
    borderTop: '1px solid #eee',
    paddingTop: '1.5rem',
  },
  petsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: '1rem',
  },
  petCard: {
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '0.5rem',
    backgroundColor: '#fafafa',
  },
  petImage: {
    width: '100%',
    height: 'auto',
    aspectRatio: '1 / 1',
    borderRadius: '4px',
  },
  petId: {
    marginTop: '0.5rem',
    fontSize: '0.9rem',
    fontWeight: '600',
    textAlign: 'center',
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    fontSize: '1rem',
    border: '1px solid #ccc',
    borderRadius: '8px',
    backgroundColor: '#fff',
    color: '#1a1a1a',
  },
};
