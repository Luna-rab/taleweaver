import { randomUUIDv7 } from "node:crypto";

import type { IdGenerator } from "../domain/ports/id-generator.js";
import { CardEditionId } from "../domain/value-objects/card-edition-id.js";
import { CardId } from "../domain/value-objects/card-id.js";
import { CardSetId } from "../domain/value-objects/card-set-id.js";
import { ImageId } from "../domain/value-objects/image-id.js";

export class UuidV7IdGenerator implements IdGenerator {
  newCardId(): CardId {
    return CardId(randomUUIDv7());
  }

  newCardEditionId(): CardEditionId {
    return CardEditionId(randomUUIDv7());
  }

  newCardSetId(): CardSetId {
    return CardSetId(randomUUIDv7());
  }

  newImageId(): ImageId {
    return ImageId(randomUUIDv7());
  }

  /** domain_events と policy_jobs の主キー。 */
  newRowId(): string {
    return randomUUIDv7();
  }
}
