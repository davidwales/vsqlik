import { SessionCache, ExtensionPath, VsQlikWebview } from "@extension/utils";
import { resolve } from "path";

export class SettingsWebview extends VsQlikWebview<any> {

    public getViewPath(): string {
        return resolve(SessionCache.get(ExtensionPath), 'dist/webview/settings/index.html');
    }

    public handleMessage(message: any): void {
        throw new Error("Method not implemented.");
    }
}
