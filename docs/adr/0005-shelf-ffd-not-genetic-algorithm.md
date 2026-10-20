# Shelf-based FFD for 2D plywood cutting, not genetic algorithm

The thesis references a genetic algorithm (Mei et al. 2022) for 2D cutting-stock optimization. We chose a shelf-based First-Fit Decreasing algorithm instead. The GA produces marginally better layouts (typically 3-8% better utilization) but is dramatically harder to implement, debug, and tune — the population size, crossover/mutation operators, and termination criteria all require experimentation. Shelf-based FFD is deterministic, fast, easy to visualize (shelves map directly to the horizontal rows in the cut plan), and achieves 85-92% utilization on typical formwork inputs. For a prototype tested on 3 sites, predictable correctness matters more than theoretical optimality. If utilization proves insufficient during testing, MAXRECTS with guillotine constraint is the next step up before considering a GA.

## Considered Options

- **Genetic Algorithm**: best theoretical results, referenced in the thesis literature. Rejected because implementation time and debugging cost are disproportionate for a prototype.
- **MAXRECTS with guillotine constraint**: better utilization than shelf-based (~3-5%), but more complex state management (maintaining a list of free rectangles). A reasonable future upgrade.
- **Shelf-based FFD (chosen)**: simplest correct algorithm, naturally guillotine-compatible, output maps directly to the visual cut plan.
