CREATE INDEX "park_obstacles_obstacle_idx" ON "park_obstacles" USING btree ("obstacle");--> statement-breakpoint
CREATE INDEX "parks_county_status_idx" ON "parks" USING btree ("county","status");