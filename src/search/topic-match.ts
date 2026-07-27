import { TOPIC_LIST, TOPICS } from "../domain/topics.js";
import type { TopicId } from "../domain/types.js";
import { keywordStems, stemSet } from "./french.js";

/**
 * Topic keywords actually present in a passage. A multi-word keyword counts only
 * when all of its stems appear.
 *
 * This is a measurable signal, not a judgement on content: it drives both chunk
 * tagging at ingestion and the evidence level at runtime.
 */
export function topicKeywordMatches(text: string, topic: TopicId): string[] {
  const stems = stemSet(text);
  return TOPICS[topic].keywords.filter((keyword) => {
    const required = keywordStems(keyword);
    return required.length > 0 && required.every((stem) => stems.has(stem));
  });
}

const TAGGING_THRESHOLD = 2;

/**
 * Topics a passage covers. Two distinct keywords are required: a single term would
 * attach any passing mention to a topic and strip the tags of any filtering power.
 */
export function tagTopics(text: string): TopicId[] {
  const stems = stemSet(text);
  const tags: TopicId[] = [];
  for (const topic of TOPIC_LIST) {
    let matches = 0;
    for (const keyword of topic.keywords) {
      const required = keywordStems(keyword);
      if (required.length > 0 && required.every((stem) => stems.has(stem))) matches += 1;
      if (matches >= TAGGING_THRESHOLD) break;
    }
    if (matches >= TAGGING_THRESHOLD) tags.push(topic.id);
  }
  return tags;
}
