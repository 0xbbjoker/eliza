import { logger, RerankedDocument, RerankerRequest, RerankerResponse } from '@elizaos/core';

/**
 * Rerank documents using HuggingFace's BGE-reranker-large
 * @see https://huggingface.co/BAAI/bge-reranker-large
 */
export async function huggingFaceReranker(
  apiKey: string,
  params: RerankerRequest,
  model: string = 'BAAI/bge-reranker-large'
): Promise<RerankerResponse<number[]>> {
  const { query, documents } = params;
  if (!query) throw new Error('Query is required for reranking');
  if (!documents || !documents.length) throw new Error('Documents are required for reranking');

  try {
    // Format data for the HuggingFace reranker
    const pairs = documents.map((doc: string) => ({
      text_1: query,
      text_2: doc,
    }));

    // Call HuggingFace Inference API
    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pairs),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HuggingFace reranker failed: ${response.statusText} - ${errorText}`);
    }

    // Parse response
    const rawResults = (await response.json()) as number[];

    // Create a standardized response
    const rerankerResponse: RerankerResponse<number[]> = {
      raw: rawResults,
      results: documents
        .map((doc: string, index: number) => ({
          index,
          score: rawResults[index] || 0,
          document: doc,
        }))
        .sort((a, b) => b.score - a.score),
    };

    return rerankerResponse;
  } catch (error) {
    logger.error('Error in HuggingFace reranker:', error);
    throw error;
  }
}
