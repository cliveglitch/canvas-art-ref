# PureRef is the behaviour reference

Image actions reproduce the behaviour in PureRef's handbook (Arrange, Align, Normalize, reverse on repeat, From first / Average), and approximate it where the handbook is silent or Canvas works differently. A change that departs from PureRef needs a reason recorded here. The plugin's own additions are acting on all images inside a selected canvas group, and Optimize group.

## Consequences

- Optimal packs for the viewport's aspect ratio, standing in for "fit the current window size".
- By order uses selection order as the Canvas stand-in for PureRef's hierarchy order.
- Group membership is geometric in Canvas, so after an image action each touched group is fitted to everything inside it, standing in for PureRef groups that adjust to their content. A group that grows can take in a nearby card.
- Addition order is kept in plugin data rather than in `.canvas` files, so canvases stay native. It is kept when a canvas is deleted, so a canvas restored from the trash gets its order back, much as a PureRef scene keeps its own data.
