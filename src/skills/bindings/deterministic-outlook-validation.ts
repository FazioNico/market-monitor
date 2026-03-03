import { validateOutlookDistribution } from "../../analysis/outlook-service";
import { ValidationError } from "../../shared/errors";
import type { OutlookDistribution } from "../../shared/types";

export async function deterministicOutlookValidationBinding(input: {
  outlook: OutlookDistribution;
}): Promise<{ valid: true; outlook: OutlookDistribution }> {
  try {
    validateOutlookDistribution(input.outlook);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError("Outlook validation binding failed");
  }
  return { valid: true, outlook: input.outlook };
}
