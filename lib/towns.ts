// Town source settings (SRS-104.6).
// Shared by app/api/towns/route.ts (create) and app/api/towns/[townId]/route.ts (edit).

export const TOWN_COLUMNS = 'town_id, name, source_account_id, meeting_time_zone';

export const TOWN_FIELD_LABELS = {
  name: 'Town name',
  source_account_id: 'Source account identifier',
  meeting_time_zone: 'Meeting time zone',
} as const;

export type TownField = keyof typeof TOWN_FIELD_LABELS;

export type TownValues = Record<TownField, string>;

const TOWN_FIELDS = Object.keys(TOWN_FIELD_LABELS) as TownField[];

// Trims every field. Anything that is not a string is treated as blank.
export function cleanTownInput(body: unknown): TownValues {
  const input = (body ?? {}) as Record<string, unknown>;
  const values = {} as TownValues;
  for (const field of TOWN_FIELDS) {
    const value = input[field];
    values[field] = typeof value === 'string' ? value.trim() : '';
  }
  return values;
}

export function findMissingTownFields(values: TownValues): TownField[] {
  return TOWN_FIELDS.filter((field) => values[field] === '');
}

// "Source account identifier is required."
// "Source account identifier and Meeting time zone are required."
export function missingFieldsMessage(fields: TownField[]): string {
  const labels = fields.map((field) => TOWN_FIELD_LABELS[field]);
  if (labels.length === 1) return `${labels[0]} is required.`;
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]} are required.`;
}

// Turns a database error into a message an administrator can act on.
export function townSaveErrorMessage(
  error: { code?: string; message?: string },
  values: TownValues,
): string {
  const message = error.message ?? '';
  if (error.code === '23505' && message.includes('source_account_id')) {
    return `A town with source account identifier "${values.source_account_id}" already exists.`;
  }
  if (error.code === '23505' && message.includes('towns_active_name_uq')) {
    return `A town named "${values.name}" already exists.`;
  }
  if (error.code === '23514' && message.includes('meeting_time_zone')) {
    return `"${values.meeting_time_zone}" is not a valid time zone. Use a name such as America/New_York.`;
  }
  return message || 'The town could not be saved.';
}
