import type { IAgentRuntime, Memory, Provider, KnowledgeItem } from '@elizaos/core';
import { addHeader, logger, ModelType } from '@elizaos/core';

/**
 * Filter knowledge fragments by relevance using reranker when available
 * @param runtime - The agent runtime
 * @param query - The query text to match against
 * @param fragments - The knowledge fragments to filter
 * @param maxResults - Maximum number of results to return
 * @param minScoreThreshold - Minimum score threshold for filtering
 * @returns Filtered fragments sorted by relevance
 */
const filterRelevantKnowledge = async (
  runtime: IAgentRuntime,
  query: string,
  fragments: KnowledgeItem[],
  maxResults: number = 10,
  minScoreThreshold: number = 0.05
): Promise<KnowledgeItem[]> => {
  // If we don't have enough fragments to filter, return them all
  if (!fragments || fragments.length <= maxResults) return fragments;

  // Check if the reranker model is available
  const hasReranker = runtime.getModel(ModelType.TEXT_RERANKER);
  if (!hasReranker) {
    // Fall back to the most relevant vector search results if no reranker
    return fragments.slice(0, maxResults);
  }

  try {
    // Extract text content from fragments
    const documentTexts = fragments.map((fragment) => fragment.content.text);

    // Use reranker to get most relevant fragments
    // The reranker plugin now returns an array of { index, score } objects
    const rankedResults = await runtime.useModel(ModelType.TEXT_RERANKER, {
      query,
      documents: documentTexts,
      topN: maxResults,
      minScoreThreshold,
    });

    // Simply map the indices to the original fragments
    return rankedResults.map((result) => fragments[result.index]);
  } catch (error) {
    logger.warn('Error using reranker to filter knowledge:', error);
    // Fall back to the initial vector search results
    return fragments.slice(0, maxResults);
  }
};

/**
 * Represents a knowledge provider that retrieves knowledge from the knowledge base.
 * @type {Provider}
 * @property {string} name - The name of the knowledge provider.
 * @property {string} description - The description of the knowledge provider.
 * @property {boolean} dynamic - Indicates if the knowledge provider is dynamic or static.
 * @property {Function} get - Asynchronously retrieves knowledge from the knowledge base.
 * @param {IAgentRuntime} runtime - The agent runtime object.
 * @param {Memory} message - The message containing the query for knowledge retrieval.
 * @returns {Object} An object containing the retrieved knowledge data, values, and text.
 */
/**
 * Represents a provider for knowledge data.
 * @type {Provider}
 * @property {string} name - The name of the knowledge provider.
 * @property {string} description - A description of the knowledge provider.
 * @property {boolean} dynamic - Indicates if the knowledge provider is dynamic.
 * @property {Function} get - Retrieves knowledge data based on the provided parameters.
 */
export const knowledgeProvider: Provider = {
  name: 'KNOWLEDGE',
  description: 'Knowledge from the knowledge base that the agent knows',
  dynamic: true,
  get: async (runtime: IAgentRuntime, message: Memory) => {
    // Get initial knowledge fragments using vector search
    const knowledgeFragments = await runtime.getKnowledge(message);

    // Apply reranking if we have enough fragments
    const filteredKnowledge =
      knowledgeFragments.length > 5
        ? await filterRelevantKnowledge(runtime, message.content.text, knowledgeFragments, 10, 0.05)
        : knowledgeFragments;

    const knowledge =
      filteredKnowledge && filteredKnowledge.length > 0
        ? addHeader(
            '# Knowledge',
            filteredKnowledge.map((knowledge) => `- ${knowledge.content.text}`).join('\n')
          )
        : '';

    return {
      data: {
        knowledge: filteredKnowledge,
        originalCount: knowledgeFragments.length,
      },
      values: {
        knowledge,
      },
      text: knowledge,
    };
  },
};
