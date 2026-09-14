import { app } from './runtime.js';
import { createBookingPlanner, createBooking, updateBooking, transitionBooking, updateBookingSettings } from '../domain/bookings.mjs';

app.bookingPlanner = () => app.DB.bookingPlanner || createBookingPlanner();

// Commands accept domain inputs; persistence owns all-store validation and recovery.
app.bookingCommand = (command, ...args) => {
  const previous = app.DB.bookingPlanner;
  app.bookingError = '';
  try {
    const context = { now: new Date().toISOString(), actor: app.DB.staff || 'Customer service', id: crypto.randomUUID() };
    const planner = app.bookingPlanner();
    let next;
    if (command === 'create') next = createBooking(planner, args[0], context);
    else if (command === 'update') next = updateBooking(planner, args[0], args[1], context);
    else if (command === 'transition') next = transitionBooking(planner, args[0], args[1], args[2] || {}, context);
    else if (command === 'settings') next = updateBookingSettings(planner, args[0], context);
    else throw new Error('Unknown booking action.');
    app.DB.bookingPlanner = next;
    if (!app.save()) throw new Error('Booking was not saved. Check the workspace storage status and retry.');
    return true;
  } catch (error) {
    if (previous === undefined) delete app.DB.bookingPlanner;
    else app.DB.bookingPlanner = previous;
    app.bookingError = error.message || 'Booking could not be saved.';
    app.toast(app.bookingError, 'err');
    return false;
  }
};
