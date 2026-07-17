import type { CoverMood, CoverStyle, Genre, Status } from '@/types';

export const GenreLabels: Record<Genre, string> = {
  FANTASY: '\uD310\uD0C0\uC9C0',
  ROMANCE: '\uB85C\uB9E8\uC2A4',
  SF: 'SF',
  MARTIAL_ARTS: '\uBB34\uD611',
  MYSTERY: '\uBBF8\uC2A4\uD130\uB9AC',
  HORROR: '\uD638\uB7EC',
  MODERN: '\uD604\uB300',
  OTHER: '\uAE30\uD0C0',
};

export const StatusLabels: Record<Status, string> = {
  ONGOING: '\uC5F0\uC7AC \uC911',
  COMPLETED: '\uC644\uACB0',
  HIATUS: '\uD734\uC7AC',
};

export const CoverStyleLabels: Record<CoverStyle, string> = {
  anime: '\uC560\uB2C8\uBA54\uC774\uC158',
  realistic: '\uC2E4\uC0AC\uD48D',
  fantasy: '\uD310\uD0C0\uC9C0 \uC544\uD2B8',
  watercolor: '\uC218\uCC44\uD654',
};

export const CoverMoodLabels: Record<CoverMood, string> = {
  mystical: '\uC2E0\uBE44\uB85C\uC6B4',
  dark: '\uC5B4\uB450\uC6B4',
  bright: '\uBC1D\uC740',
  romantic: '\uB85C\uB9E8\uD2F1',
  action: '\uC561\uC158',
  calm: '\uCC28\uBD84\uD55C',
};
