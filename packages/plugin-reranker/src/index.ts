import type {
  IAgentRuntime,
  Plugin,
  RerankedDocument,
  RerankerParams,
  RerankerRequest,
} from '@elizaos/core';
import { ModelType, logger } from '@elizaos/core';
import { cohereReranker } from './models/cohereReranker';
import { huggingFaceReranker } from './models/huggingFaceReranker';

/**
 * Reranker plugin that supports Cohere and HuggingFace models
 */
export const rerankerPlugin: Plugin = {
  name: 'reranker',
  description: 'Reranker plugin for various models including Cohere and HuggingFace',
  config: {
    COHERE_API_KEY: process.env.COHERE_API_KEY,
    HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY,
    RERANKER_MODEL: process.env.RERANKER_MODEL || 'rerank-v3.5',
    RERANKER_SPECIFIC_MODEL: process.env.RERANKER_SPECIFIC_MODEL,
  },
  async init(config: Record<string, string>) {
    const rerankerModel = config.RERANKER_MODEL || process.env.RERANKER_MODEL || 'cohere';

    // Check if we have the appropriate API key for the selected model
    switch (rerankerModel.toLowerCase()) {
      case 'cohere':
        if (!config.COHERE_API_KEY && !process.env.COHERE_API_KEY) {
          logger.warn('COHERE_API_KEY is not set - Cohere reranking will not be available');
        }
        break;
      case 'huggingface':
      case 'bge':
        if (!config.HUGGINGFACE_API_KEY && !process.env.HUGGINGFACE_API_KEY) {
          logger.warn(
            'HUGGINGFACE_API_KEY is not set - HuggingFace reranking will not be available'
          );
        }
        break;
      default:
        logger.warn(`Unknown reranker model: ${rerankerModel} - defaulting to Cohere`);
    }
  },
  models: {
    [ModelType.TEXT_RERANKER]: async (
      runtime: IAgentRuntime,
      params: RerankerParams
    ): Promise<RerankedDocument[]> => {
      // Get query and documents from params
      const query = typeof params === 'string' ? params : params?.query || '';
      const documents = params.documents || [];

      if (!query) throw new Error('Query is required for reranking');
      if (!documents.length) throw new Error('Documents are required for reranking');

      // Get the selected reranker model from runtime settings or environment variables
      const rerankerType =
        runtime.getSetting('RERANKER_MODEL') || process.env.RERANKER_MODEL || 'cohere';

      const specificModel =
        runtime.getSetting('RERANKER_SPECIFIC_MODEL') || process.env.RERANKER_SPECIFIC_MODEL;

      // Create a RerankerRequest object without the runtime property
      const rerankerRequest: RerankerRequest = {
        query,
        documents,
        maxResults: params.maxResults,
        model: params.model,
        truncate: params.truncate,
        maxChunksPerDoc: params.maxChunksPerDoc,
        evaluationMode: params.evaluationMode,
      };

      // Call the appropriate reranker based on the model type
      switch (rerankerType.toLowerCase()) {
        case 'cohere':
          const cohereApiKey = runtime.getSetting('COHERE_API_KEY') || process.env.COHERE_API_KEY;
          if (!cohereApiKey) throw new Error('COHERE_API_KEY is required for Cohere reranking');
          const cohereResponse = await cohereReranker(
            cohereApiKey,
            rerankerRequest,
            specificModel || 'rerank-v3.5'
          );
          return cohereResponse.results;

        case 'huggingface':
        case 'bge':
          const hfApiKey =
            runtime.getSetting('HUGGINGFACE_API_KEY') || process.env.HUGGINGFACE_API_KEY;
          if (!hfApiKey)
            throw new Error('HUGGINGFACE_API_KEY is required for HuggingFace reranking');
          const hfResponse = await huggingFaceReranker(
            hfApiKey,
            rerankerRequest,
            specificModel || 'BAAI/bge-reranker-large'
          );
          return hfResponse.results;

        default:
          throw new Error(
            `Unknown reranker model: ${rerankerType}. Supported models are 'cohere' and 'huggingface'/'bge'`
          );
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
            if (!process.env.COHERE_API_KEY) {
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
        {
          name: 'test_huggingface_reranker',
          fn: async (runtime) => {
            if (!process.env.HUGGINGFACE_API_KEY) {
              logger.warn('Skipping HuggingFace reranker test - HUGGINGFACE_API_KEY not set');
              return;
            }

            try {
              // Override the reranker model for this test
              process.env.RERANKER_MODEL = 'huggingface';

              const documents = [
                'The quick brown fox jumps over the lazy dog',
                'The five boxing wizards jump quickly',
                'How vexingly quick daft zebras jump',
              ];

              const results = await runtime.useModel(ModelType.TEXT_RERANKER, {
                runtime,
                query: 'quick animals jumping',
                documents,
              });

              logger.log('HuggingFace reranker test results:', results);
              if (!results || !results.length) {
                throw new Error('Failed to rerank documents with HuggingFace');
              }

              // Reset the reranker model
              delete process.env.RERANKER_MODEL;
            } catch (error) {
              logger.error('Error in test_huggingface_reranker:', error);
              throw error;
            }
          },
        },
      ],
    },
  ],
};

export default rerankerPlugin;
