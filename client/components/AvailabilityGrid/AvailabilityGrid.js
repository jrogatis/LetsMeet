import React, { Component } from 'react';
import cssModules from 'react-css-modules';
import _ from 'lodash';
import Moment from 'moment';
import { extendMoment } from 'moment-range';
import autobind from 'autobind-decorator';
import jsonpatch from 'fast-json-patch';
import jz from 'jstimezonedetect';
import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';
import Dialog from 'material-ui/Dialog';
import PropTypes from 'prop-types';

import GridHours from './availabilityGridHoursTitle';
import GridRow from './availabilityGridRows';
import { createGridComplete, editParticipantToCellGrid, genHeatMapBackgroundColors,
  createTimesRange, createDatesRange, availabilityReducer, jumpTimeIndex,
} from '../AvailabilityGrid/availabilityGridUtils';
import SnackBarGrid from '../SnackBarGrid/SnackBarGrid';
import enteravailGif from '../../assets/enteravail.gif';
import { loadEventFull } from '../../util/events';
import styles from './availability-grid.css';
import { isEvent, isCurUser } from '../../util/commonPropTypes';

const moment = extendMoment(Moment);

class AvailabilityGrid extends Component {

  constructor(props) {
    super(props);
    this.state = { openModal: false,
      grid: {},
      backgroundColors: [],
      openSnackBar: false,
      snackBarGuests: [],
      snackBarNoGuests: [],
      showHeatmap: false,
      mouseDown: false,
      editOperation: null,
      cellInitialRow: null,
      cellInitialColumn: null,
      jumpTimeIdx: null,
      event: {},
      allTimes: [],
    };
  }

  componentWillMount() {
    const { event, dates, showHeatmap } = this.props;
    const allDates = createDatesRange(dates);
    const allTimes = createTimesRange(dates);
    const grid = createGridComplete(allDates, allTimes, event);
    const backgroundColors = genHeatMapBackgroundColors(event.participants);
    const jumpTimeIdx = jumpTimeIndex(allTimes);

    this.setState({ grid, backgroundColors, allTimes, showHeatmap, allDates, event, jumpTimeIdx });
  }

  componentWillReceiveProps(nextProps) {
    const { event, dates, showHeatmap } = nextProps;
    const allDates = createDatesRange(dates);
    const allTimes = createTimesRange(dates);
    const grid = createGridComplete(allDates, allTimes, event);
    const backgroundColors = genHeatMapBackgroundColors(event.participants);
    const jumpTimeIdx = jumpTimeIndex(allTimes);
    this.setState({ grid, backgroundColors, showHeatmap, allDates, event, allTimes, jumpTimeIdx });
  }

  @autobind
  async submitAvailability() {
    const { curUser } = this.props;
    const { grid } = this.state;
    const availability = [];
    grid.forEach((row) => {
      row.quarters.forEach((quarter) => {
        if (_.findIndex(quarter.participants, curUser._id) > -1) {
          const from = moment(quarter.time)._d;
          const to = moment(quarter.time).add(15, 'm')._d;
          availability.push([from, to]);
        }
      });
    });
    // need to call the full event to edit... since he dosn't have the
    // info that maybe have a guest "deleted"
    try {
      const eventToEdit = await loadEventFull(this.state.event._id);
      const event = JSON.parse(JSON.stringify(eventToEdit));
      const observerEvent = jsonpatch.observe(event);
      // find for curUser at the array depends if is a participant
      // yet or not
      let curParticipant = _.find(event.participants, ['userId._id', curUser._id]);
      // first check if cur exists as a participant
      // if is not add the curUser as participant
      if (!curParticipant) {
        const { _id: userId } = curUser;
        const participant = { userId };
        event.participants.push(participant);
        curParticipant = _.find(event.participants, ['userId', curUser._id]);
      }
      curParticipant.status = (availability.length === 0) ? 2 : 3;
      const availabilityEdited = (availability.length > 0) ? availabilityReducer(availability) : [];
      // because the patch jsonpatch dosent work as espected when you have a arrays of arrays
      // we need to generate a patch to delete all availability and then add ther availability again
      // then merge both patchs arrays.
      curParticipant.availability = [];
      const patchforDelete = jsonpatch.generate(observerEvent);
      curParticipant.availability = availabilityEdited;
      const patchesforAdd = jsonpatch.generate(observerEvent);
      const patches = _.concat(patchforDelete, patchesforAdd);
      await this.props.submitAvail(patches);
    } catch (err) {
      console.log('err at submit avail', err);
    }
  }

  @autobind
  handleCellMouseDown(ev, quarter, rowIndex, columnIndex) {
    ev.preventDefault();
    const { showHeatmap, grid } = this.state;
    const { curUser } = this.props;
    // is at showing heatMap then ignore click
    if (showHeatmap) return;
    const editOperation = (_.findIndex(quarter.participants, curUser._id) > -1) ? 'remove' : 'add';
    this.setState({
      mouseDown: true,
      editOperation,
      cellInitialColumn: columnIndex,
      cellInitialRow: rowIndex,
      grid: editParticipantToCellGrid(
        quarter, editOperation, rowIndex, columnIndex, rowIndex, columnIndex, curUser, grid),
    });
  }

  @autobind
  handleCellMouseOver(ev, quarter, rowIndex, columnIndex) {
    ev.preventDefault();
    if (quarter.disable) return;
    const { showHeatmap, mouseDown, editOperation, cellInitialRow, cellInitialColumn } = this.state;
    const { curUser } = this.props;
    if (!showHeatmap) {
      if (mouseDown) {
        this.setState(oldState => ({
          grid: editParticipantToCellGrid(
            quarter, editOperation, rowIndex, columnIndex, cellInitialRow,
            cellInitialColumn, curUser, oldState.grid) }));
      }
    } else {
      const snackBarGuests = quarter.participants.map(participant => Object.values(participant));
      const snackBarNoGuests =
        quarter.notParticipants.map(participant => Object.values(participant));
      this.setState({ openSnackBar: true, snackBarGuests, snackBarNoGuests });
    }
  }

  @autobind
  handleCellMouseUp(ev) {
    ev.preventDefault();
    this.setState({
      mouseDown: false, cellInitialColumn: null, cellInitialRow: null, editOperation: null });
  }

  @autobind
  handleCellMouseLeave(ev) {
    ev.preventDefault();
    const { showHeatmap } = this.state;
    if (!showHeatmap) return;
    this.setState({ openSnackBar: false });
  }

  @autobind
  handleCancelBtnClick() {
    const { allDates, allTimes, event } = this.state;
    const grid = createGridComplete(allDates, allTimes, event);
    this.setState({ grid });
    this.props.closeEditorGrid();
  }

  renderDialog() {
    const { openModal } = this.state;
    const actions = [<FlatButton label="close" primary onTouchTap={() => this.setState({ openModal: false })} />];
    const inlineStyles = { modal: {
      content: { width: '630px', maxWidth: '630px' },
      bodyStyle: { paddingTop: 10, fontSize: '25px' } } };

    return (
      <Dialog
        contentStyle={inlineStyles.modal.content}
        bodyStyle={inlineStyles.modal.bodyStyle}
        actions={actions}
        modal
        open={openModal}
      >
        <h4>This is how you can enter and remove your availablity:</h4>
        <img src={enteravailGif} alt="entering availablity gif" />
      </Dialog>
    );
  }

  renderGrid() {
    const { grid, allTimes, backgroundColors, showHeatmap, jumpTimeIdx } = this.state;
    const { curUser, heightlightedUser } = this.props;
    return (
      <div>
        <GridHours allTimes={allTimes} jumpIndexAllTimes={jumpTimeIdx} />
        {grid.map((row, rowIndex) => (
          <div key={row.date} styleName="column">
            <div styleName="rowGrid">
              <div styleName="date-cell"> {row.date.format('Do MMM')} <br /> {row.date.format('ddd')} </div>
              <GridRow
                backgroundColors={backgroundColors}
                showHeatmap={showHeatmap}
                curUser={curUser}
                quarters={row.quarters}
                rowIndex={rowIndex}
                handleCellMouseOver={this.handleCellMouseOver}
                handleCellMouseLeave={this.handleCellMouseLeave}
                handleCellMouseDown={this.handleCellMouseDown}
                handleCellMouseUp={this.handleCellMouseUp}
                heightlightedUser={heightlightedUser}
                jumpTimeIdx={jumpTimeIdx}
              />
            </div>
          </div>))}
      </div>
    );
  }

  renderActionButtons() {
    const { showHeatmap } = this.state;
    return (
      <div styleName="actionButtonsWrapper">
        {showHeatmap ? <RaisedButton primary label="Edit Availability" onClick={this.props.editAvail} />
        : <div>
          <RaisedButton primary label="Submit" onClick={this.submitAvailability} />
          <RaisedButton primary label="Cancel" styleName="cancelButton" onClick={this.handleCancelBtnClick} />
        </div>
        }
      </div>
    );
  }

  render() {
    const { snackBarGuests, snackBarNoGuests, openSnackBar } = this.state;
    return (
      <div styleName="column">
        <div styleName="row">
          <FlatButton primary onClick={() => this.setState({ openModal: true })} >
            How do I use the grid?
          </FlatButton>
        </div>
        {this.renderGrid()}
        <div styleName="info">
          <p> <em>Each time slot represents 15 minutes.</em> </p>
          <p> <em>  Displaying all times in your local timezone: {jz.determine().name()}</em></p>
        </div>
        <br />
        {this.renderActionButtons()}
        <SnackBarGrid
          guests={snackBarGuests}
          noGuests={snackBarNoGuests}
          openSnackBar={openSnackBar}
        />
        {this.renderDialog()}
      </div>
    );
  }
}

AvailabilityGrid.defaultProps = {
  showHeatmap: false,
  editAvail: () => { console.log('ediAvail func not passed in!'); },
  closeEditorGrid: () => { console.log('closeGrid func not passed in!'); },
  submitAvail: () => { console.log('submitAvail func not passed in!'); },
  event: () => { console.log('event prop validation not set!'); },
  curUser: () => { console.log('curUser prop validation not set!'); },
  heightlightedUser: '',
};

AvailabilityGrid.propTypes = {
  // Function to run when availability for current user is ready to be updated
  submitAvail: PropTypes.func,
  // Function to run to switch from heat map to availability editing
  editAvail: PropTypes.func,
  // Function to run when user wishes to cancel availability editing
  closeEditorGrid: PropTypes.func,

  // List of dates ranges for event
  dates: PropTypes.arrayOf(PropTypes.shape({
    fromDate: PropTypes.instanceOf(Date),
    toDate: PropTypes.instanceOf(Date),
  })).isRequired,

  // True if grid is showing heat map
  showHeatmap: PropTypes.bool,
  // Event containing list of event participants
  event: isEvent,
  // Current user
  curUser: isCurUser,
  heightlightedUser: PropTypes.string,
};

export default cssModules(AvailabilityGrid, styles);
