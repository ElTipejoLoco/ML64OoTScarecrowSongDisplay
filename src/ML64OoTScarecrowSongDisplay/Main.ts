import { IPlugin, IModLoaderAPI } from 'modloader64_api/IModLoaderAPI';
import { IOOTCore } from 'modloader64_api/OOT/OOTAPI';
import { InjectCore } from 'modloader64_api/CoreInjection';
import { onViUpdate } from 'modloader64_api/PluginLifecycle';
import { FlipFlags, Font, Texture } from "modloader64_api/Sylvain/Gfx";
import { rgba, xy, xywh } from "modloader64_api/Sylvain/vec";
import fs from 'fs';
import path from 'path';
import { SpriteMap } from "./SpriteMap";

const enum SongNotes {
    NONE = 0,
    A_FLAT = 1,
    A_NOTE = 2,
    A_SHARP = 3,
    C_DOWN_FLAT = 4,
    C_DOWN_NOTE = 5,
    C_DOWN_SHARP = 6,
    C_RIGHT_FLAT = 8,
    C_RIGHT_NOTE = 9,
    C_RIGHT_SHARP = 10,
    C_LEFT_FLAT = 10,
    C_LEFT_NOTE = 11,
    C_LEFT_SHARP = 12,
    C_UP_FLAT = 13,
    C_UP_NOTE = 14,
    C_UP_SHARP = 15,
    SILENCE = 0xFF,
}

const enum SongFlags {
    NONE = 0,
    FLATTENED_NOTE = 0x40,
    SHARPENED_NOTE = 0x80,
    CONTINUE_SILENCE = 0xC0,
}

class ScarecrowSongNoteStruct {
    buf: Buffer;

    constructor(buf: Buffer) {
        this.buf = buf;
    }

    get note(): Buffer {
        return this.buf.slice(0x0, 0x1);
    }

    get unused(): Buffer {
        return this.buf.slice(0x1, 0x2);
    }

    get duration(): Buffer {
        return this.buf.slice(0x2, 0x4);
    }

    get volume(): Buffer {
        return this.buf.slice(0x4, 0x5);
    }

    get vibrato(): Buffer {
        return this.buf.slice(0x5, 0x6);
    }

    get pitch(): Buffer {
        return this.buf.slice(0x6, 0x7);
    }

    get special(): Buffer {
        return this.buf.slice(0x7, 0x8);
    }
}

class ScarecrowSongDisplay {
    msg: string;
    notes: string[];

    constructor(msg: string, notes: string[]) {
        this.msg = msg;
        this.notes = notes;
    }
}

class Main implements IPlugin {

    ModLoader!: IModLoaderAPI;
    pluginName?: string | undefined;
    @InjectCore()
    core!: IOOTCore;
    font!: Font;
    scarecrowsSongChildFlag: boolean = false;
    scarecrowsSong!: Buffer;
    questStatusShown: boolean = false;
    songDisplay: ScarecrowSongDisplay | undefined;
    resourcesLoaded: boolean = false;
    noteIcons: Map<string, Texture> = new Map<string, Texture>();

    preinit(): void {
    }
    init(): void {
    }
    postinit(): void {
    }
    onTick(frame?: number | undefined): void {
        if (!this.questStatusShown) {
            if (this.core.helper.isPaused() && this.ModLoader.emulator.rdramRead8(0x801D8DD5) == 0x06 && this.ModLoader.emulator.rdramRead8(0x801D8DE5) !== 0x01 && this.ModLoader.emulator.rdramRead8(0x801D8DE9) == 0x02) {
                this.questStatusShown = true;
            }
        }
        else if (this.questStatusShown) {
            if (!this.core.helper.isPaused() || this.ModLoader.emulator.rdramRead8(0x801D8DD5) !== 0x06 || this.ModLoader.emulator.rdramRead8(0x801D8DE5) == 0x01 || this.ModLoader.emulator.rdramRead8(0x801D8DE9) !== 0x02) {
                this.questStatusShown = false;
            }
        }
        this.scarecrowsSongChildFlag = this.ModLoader.emulator.rdramRead16(global.ModLoader.save_context + 0x12c4) === 1;
        this.scarecrowsSong = this.ModLoader.emulator.rdramReadBuffer(global.ModLoader.save_context + 0x12c6, 0x80);
        if (this.questStatusShown && this.scarecrowsSongChildFlag && Object.values(this.scarecrowsSong).some(v => v !== 0 && v !== null && typeof v !== "undefined")) {
            let i = 0;
            let obj = this.scarecrowsSong;
            let btnNotes: Array<string> = [];
            while (i <= 7) {
                for (let j = 0; j < obj.byteLength; j += 0x8) {
                    let struct = new ScarecrowSongNoteStruct(obj.slice(j, j + 0x8));
                    if (struct.note[0] !== SongNotes.SILENCE) {
                        if (struct.note[0] == SongNotes.A_FLAT || struct.note[0] == SongNotes.A_NOTE || struct.note[0] == SongNotes.A_SHARP) {
                            btnNotes[i] = "note_a";
                        }
                        if (struct.note[0] == SongNotes.C_DOWN_FLAT || struct.note[0] == SongNotes.C_DOWN_NOTE || struct.note[0] == SongNotes.C_DOWN_SHARP) {
                            btnNotes[i] = "note_c_down";
                        }
                        if (struct.note[0] == SongNotes.C_RIGHT_FLAT || struct.note[0] == SongNotes.C_RIGHT_NOTE || (struct.note[0] == SongNotes.C_RIGHT_SHARP && struct.special[0] == SongFlags.SHARPENED_NOTE)) {
                            btnNotes[i] = "note_c_right";
                        }
                        if ((struct.note[0] == SongNotes.C_LEFT_FLAT && struct.special[0] == SongFlags.FLATTENED_NOTE) || struct.note[0] == SongNotes.C_LEFT_NOTE || struct.note[0] == SongNotes.C_LEFT_SHARP) {
                            btnNotes[i] = "note_c_left";
                        }
                        if (struct.note[0] == SongNotes.C_UP_FLAT || struct.note[0] == SongNotes.C_UP_NOTE || struct.note[0] == SongNotes.C_UP_SHARP) {
                            btnNotes[i] = "note_c_up";
                        }
                        i++;
                    }
                }
            }
            this.songDisplay = new ScarecrowSongDisplay('Your Scarecrow\'s Song: ', btnNotes);
        }
    }
    @onViUpdate()
    onVi() {
        if (this.font === undefined) {
            try {
                this.font = this.ModLoader.Gfx.createFont();
                this.font.loadFromFile(path.resolve(__dirname, "HyliaSerifBeta-Regular.otf"), 22, 2);
                global.ModLoader["FONT"] = this.font;
            } catch (err) {
                this.ModLoader.logger.error(err);
            }
            return;
        }
        if (!this.resourcesLoaded) {
            let base: string = path.resolve(__dirname, "sprites");
            fs.readdirSync(base).forEach((file: string) => {
                let p = path.resolve(base, file);
                let t: Texture = this.ModLoader.Gfx.createTexture();
                t.loadFromFile(p);
                this.noteIcons.set(path.parse(file).name, t);
            });
            this.resourcesLoaded = true;
        }
        if (this.questStatusShown && this.songDisplay !== undefined) {
            try {
                let btmRx = this.ModLoader.ImGui.getWindowWidth();
                let btmRy = this.ModLoader.ImGui.getWindowHeight();
                let txtSize = this.ModLoader.Gfx.calcTextSize(global.ModLoader["FONT"], this.songDisplay.msg, xy(1, 1));
                for (let i = 0; i <= 7; i++) {
                    let noteTexture = this.noteIcons.get(SpriteMap.get(this.songDisplay.notes[i])!)!;
                    this.ModLoader.Gfx.addSprite(this.ModLoader.ImGui.getBackgroundDrawList(), noteTexture, xywh(0, 0, noteTexture.width, noteTexture.height), xywh(btmRx - 98 + (i * 12), btmRy - 34, 12, 32), rgba(0xFF, 0xFF, 0xFF, 0xFF), FlipFlags.None);
                }
                this.ModLoader.Gfx.addText(this.ModLoader.ImGui.getBackgroundDrawList(), global.ModLoader["FONT"], this.songDisplay.msg, xy(btmRx - txtSize.x - 98, btmRy - (txtSize.y + 2)), rgba(0xFF, 0xFF, 0xFF, 0xFF), rgba(0, 0, 0, 0xFF), xy(1, 1));
            } catch (err) {
                console.log(this.songDisplay);
            }
        }
    }

}

module.exports = Main;