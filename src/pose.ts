import { Euler, Quaternion } from "three";
import type { VRMHumanBoneName, VRMPose } from "@pixiv/three-vrm";
import type { Motion, PoseIndex } from "./types";

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Pose offsets are authored in VRM 1's canonical +Z-facing space. */
export function createLocomotionPose(
  motion: Motion,
  pose: PoseIndex,
  strength: number,
  isVRM0: boolean,
): VRMPose {
  const result: VRMPose = {};
  const rotation = (bone: VRMHumanBoneName, x = 0, y = 0, z = 0): void => {
    const quaternion = new Quaternion().setFromEuler(
      new Euler(radians(x), radians(y), radians(z), "XYZ"),
    );
    // rotateVRM0 turns the scene, but normalized rotations still use VRM 0's
    // -Z-facing rest space. Conjugating by a half-turn also corrects its arms.
    if (isVRM0) {
      quaternion.x *= -1;
      quaternion.z *= -1;
    }
    result[bone] = { rotation: quaternion.toArray() };
  };

  const running = motion === "run";
  const phase = pose === 1 ? 1 : pose === 2 ? -1 : 0;
  const stride = (running ? 43 : 26) * strength;
  const armSwing = (running ? 35 : 21) * strength;
  const lean = (running ? 10 : 2) * strength;

  rotation("hips", 0, phase * 2.5 * strength, 0);
  rotation(
    "spine",
    lean * 0.65,
    -phase * 2 * strength,
    -phase * (running ? 2 : 1) * strength,
  );
  rotation("chest", lean * 0.35, -phase * 1.5 * strength, 0);
  rotation("neck", -lean * 0.25);
  rotation("head", -lean * 0.25);

  for (const side of ["left", "right"] as const) {
    const sideSign = side === "right" ? 1 : -1;
    const forward = phase * sideSign;
    const upperLeg =
      -forward * stride + (running && phase === 0 ? -8 * strength : 0);
    const knee = running
      ? (phase === 0 ? 22 : forward > 0 ? 24 : 73) * strength
      : (phase === 0 ? 0 : forward > 0 ? 7 : 19) * strength;
    const ankle =
      running && forward < 0
        ? -(upperLeg + knee) * 0.4
        : -(upperLeg + knee) * 0.85;

    rotation(`${side}UpperLeg`, upperLeg, 0, -sideSign * 1.5);
    rotation(`${side}LowerLeg`, knee);
    rotation(`${side}Foot`, ankle);
    rotation(`${side}Toes`, running && forward < 0 ? -10 * strength : 0);

    // T-pose arms lie on ±X. Z lowers them; X then swings the lowered arm.
    // Forearms bend around ±Y so the elbows flex forward in canonical space.
    rotation(
      `${side}UpperArm`,
      forward * armSwing,
      0,
      sideSign * (running ? 76 : 80),
    );
    rotation(`${side}LowerArm`, 0, sideSign * (running ? 72 : 12));
    rotation(`${side}Hand`, 0, 0, -sideSign * (running ? 5 : 2));
  }

  return result;
}
