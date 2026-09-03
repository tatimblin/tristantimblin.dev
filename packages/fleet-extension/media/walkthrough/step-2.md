The controls editor is a custom editor bound to a zero-byte `controls.vehicle`
file. Commands take 600–900 ms and can fail.

The rejections are derived from state, not dice: Atlas refuses because it is
doing 100 km/h (`IN_MOTION`), Cinder because it is asleep, Dune because its
driver's door is ajar. Try Atlas first — a demo where everything succeeds is
a demo that is not simulating anything.
