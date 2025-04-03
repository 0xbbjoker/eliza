import { logger, RerankerRequest, RerankerResponse } from '@elizaos/core';
import { CohereClient } from 'cohere-ai';
import { V2RerankRequest } from 'cohere-ai/api';

/**
 * Rerank documents using Cohere's reranking model
 */
export async function cohereReranker(
  apiKey: string,
  params: RerankerRequest,
  model: string = 'rerank-v3.5'
): Promise<RerankerResponse<any>> {
  const { query, documents, maxResults } = params;
  if (!query) throw new Error('Query is required for reranking');
  if (!documents || !documents.length) throw new Error('Documents are required for reranking');

  try {
    // Initialize the Cohere client with the API key
    const cohere = new CohereClient({
      token: apiKey,
    });

    // Prepare parameters for the SDK
    const rerankParams: Record<string, any> = {
      documents,
      query,
      model,
      topN: maxResults || documents.length,
    };

    // Add optional parameters if they exist
    if (params.truncate) rerankParams.truncate = params.truncate;
    if (params.maxChunksPerDoc) rerankParams.maxChunksPerDoc = params.maxChunksPerDoc;
    if (params.evaluationMode) rerankParams.evaluationMode = params.evaluationMode;

    // Call the rerank method using the SDK
    const rawResult = await cohere.v2.rerank(rerankParams as V2RerankRequest);

    // Create a standardized response to match the expected format
    const rerankerResponse: RerankerResponse<any> = {
      raw: rawResult,
      results: rawResult.results.map((item: any) => {
        // Get the original document from the input documents
        const originalDocument = documents[item.index] || '';

        return {
          index: item.index,
          score: item.relevance_score,
          document: originalDocument,
        };
      }),
    };

    return rerankerResponse;
  } catch (error) {
    logger.error('Error in Cohere reranker:', error);
    throw error;
  }
}
