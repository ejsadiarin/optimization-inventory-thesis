# Guillotine cuts only for plywood optimization

The 2D cutting optimizer only generates guillotine-constrained layouts: every cut goes straight across the full width or height of the remaining piece, splitting it into two rectangles. We rejected free-cut (non-guillotine) placement, which allows slightly better material utilization but produces layouts that are impractical to execute with a circular saw on a construction site. Since the system's output is a cutting plan that construction workers follow physically, a layout they can't cut is useless regardless of its theoretical efficiency.
