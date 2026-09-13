import { contentSchema } from '@tutorialkit/types';
import { defineCollection } from 'astro:content';
export const collections = { tutorial: defineCollection({ type: 'content', schema: contentSchema }) };
