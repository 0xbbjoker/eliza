import type { IAgentRuntime, Plugin, RerankerParams } from '@elizaos/core';
import { ModelType, logger } from '@elizaos/core';
import { cohereReranker } from './models/cohereReranker';
import { V2RerankRequest } from 'cohere-ai/api';

/**
 * Reranker plugin that supports Cohere models
 */
export const rerankerPlugin: Plugin = {
  name: 'reranker',
  description: 'Reranker plugin that can support multiple models',
  config: {
    COHERE_API_KEY: process.env.COHERE_API_KEY,
    RERANKER_MODEL: process.env.RERANKER_MODEL || 'rerank-v3.5',
  },
  async init(config: Record<string, string>) {
    // Check if we have the appropriate API key for the selected model
    if (!config.COHERE_API_KEY) {
      logger.warn('COHERE_API_KEY is not set - Cohere reranking will not be available');
    }
  },
  models: {
    [ModelType.TEXT_RERANKER]: async (
      runtime: IAgentRuntime,
      params: RerankerParams
    ): Promise<any> => {
      // Get query and documents from params
      const query = typeof params === 'string' ? params : params?.query || '';
      const documents = params.documents || [];
      const minScoreThreshold = params.minScoreThreshold || 0;
      const maxTokensPerDoc = params.maxTokensPerDoc || 4096;
      const topN = params.topN || documents.length;

      if (!query) throw new Error('Query is required for reranking');
      if (!documents.length) throw new Error('Documents are required for reranking');

      // Get the reranker model from runtime settings (configured at init) or use default
      const model = runtime.getSetting('RERANKER_MODEL') || 'rerank-v3.5';

      // Create a reranker request object with model-specific parameters
      const rerankerRequest: V2RerankRequest = {
        query,
        documents,
        topN,
        model,
        // Set defaults for Cohere-specific parameters
        maxTokensPerDoc: maxTokensPerDoc || 4096,
        returnDocuments: true,
      };

      try {
        const cohereApiKey = runtime.getSetting('COHERE_API_KEY');
        if (!cohereApiKey) throw new Error('COHERE_API_KEY is required for Cohere reranking');
        const cohereResponse = await cohereReranker(cohereApiKey, rerankerRequest);

        // Return ranked indices directly to avoid double mapping in providers
        return cohereResponse.results
          .filter((result) => minScoreThreshold <= 0 || result.relevanceScore >= minScoreThreshold)
          .sort((a, b) => b.relevanceScore - a.relevanceScore)
          .map((result) => ({
            index: result.index,
            score: result.relevanceScore,
          }));
      } catch (error) {
        logger.error(`Error in Cohere reranker:`, error);
        // In case of error, return the original document indices in order
        return documents.slice(0, topN).map((_, index) => ({
          index,
          score: 0,
        }));
      }
    },
  },

  // Add tests for the plugin
  tests: [
    {
      name: 'reranker_plugin_tests',
      tests: [
        {
          name: 'test_cohere_reranker',
          fn: async (runtime) => {
            // Skip test if API key is not configured
            const cohereApiKey = runtime.getSetting('COHERE_API_KEY');
            if (!cohereApiKey) {
              logger.warn('Skipping Cohere reranker test - COHERE_API_KEY not set');
              return;
            }

            try {
              const documents = [
                'The quick brown fox jumps over the lazy dog',
                'The five boxing wizards jump quickly',
                'How vexingly quick daft zebras jump',
              ];

              const results = await runtime.useModel(ModelType.TEXT_RERANKER, {
                runtime,
                query: 'quick animals jumping',
                documents,
                minScoreThreshold: 0.05,
                truncate: 'END',
                maxChunksPerDoc: 10,
                evaluationMode: false,
              });

              logger.log('Cohere reranker test results:', results);
              if (!results || !results.length) {
                throw new Error('Failed to rerank documents with Cohere');
              }
            } catch (error) {
              logger.error('Error in test_cohere_reranker:', error);
              throw error;
            }
          },
        },
      ],
    },
  ],
};

export default rerankerPlugin;
