import { logger } from '@elizaos/core';
import { CohereClient } from 'cohere-ai';
import { V2RerankRequest, V2RerankResponse } from 'cohere-ai/api';

/**
 * Rerank documents using Cohere's reranking model
 */
export async function cohereReranker(
  apiKey: string,
  params: V2RerankRequest
): Promise<V2RerankResponse> {
  try {
    // Initialize the Cohere client with the API key
    const cohere = new CohereClient({
      token: apiKey,
    });

    return cohere.v2.rerank(params);
  } catch (error) {
    logger.error('Error in Cohere reranker:', error);
    throw error;
  }
}
