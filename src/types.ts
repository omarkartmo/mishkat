export type ViewMode = 'ideation' | 'prototype' | 'architecture' | 'components';

export interface AppIdeaProposal {
  id: string;
  title: string;
  titleAr: string;
  category: string;
  categoryAr: string;
  description: string;
  descriptionAr: string;
  keyFeatures: string[];
  keyFeaturesAr: string[];
  uiStyle: 'fluent' | 'macos-acrylic' | 'linear-dark' | 'nordic-clean';
  icon: string;
  techStack: string[];
}

export interface FeatureRequirement {
  id: string;
  title: string;
  category: 'core' | 'ui' | 'integration' | 'performance';
  priority: 'must' | 'should' | 'could';
  completed: boolean;
}

export interface DesktopSystemState {
  cpuUsage: number;
  memoryUsage: number;
  isMaximized: boolean;
  theme: 'dark' | 'light';
  language: 'ar' | 'en';
}
