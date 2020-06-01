import { ConnectionSetting } from "@core/connection";
import { Setting } from "./settings.repository";

export enum FileRenderer {
    JSON,
    YAML
}

export interface WorkspaceSetting extends Setting {

    label: string;

    connection: ConnectionSetting;

    fileRenderer: FileRenderer;
}
