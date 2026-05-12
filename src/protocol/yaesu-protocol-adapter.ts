import { BaseTextFamilyAdapter } from "./base-family-adapter";

export class YaesuProtocolAdapter extends BaseTextFamilyAdapter {
  constructor() {
    super("yaesu", ";");
  }
}
