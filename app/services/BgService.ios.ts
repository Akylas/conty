import { BgServiceCommon, BgServiceLoadedEvent } from '~/services/BgService.common';
import { StoryHandler } from '~/handlers/StoryHandler';

export { BgServiceLoadedEvent };

export class BgService extends BgServiceCommon {
    readonly storyHandler: StoryHandler;
    constructor() {
        super();
        this.storyHandler = new StoryHandler(this);
        this._handlerLoaded();
    }
}

let bgService: BgService;
export function getBGServiceInstance() {
    if (!bgService) {
        bgService = new BgService();
    }
    return bgService;
}
