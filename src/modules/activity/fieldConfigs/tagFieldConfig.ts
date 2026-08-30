import type { ActivityFieldConfigMap } from '../activityLogService.js';

// A tag assignment has nothing meaningful to diff on update (there is no update — a tag is only
// ever assigned or removed) — this single field just makes the name show up in the expandable
// detail alongside the auto-generated "Created/Deleted Tag ..." summary.
export const tagActivityFieldConfig: ActivityFieldConfigMap = {
  name: { label: 'Tag name' },
};
