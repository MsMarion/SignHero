/** A MongoDB ObjectId as it appears in URLs and API inputs. Anything else cannot exist, so it is "not found". */
export const isObjectId = (value: string): boolean => /^[0-9a-f]{24}$/i.test(value);
